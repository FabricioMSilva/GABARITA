import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ConcursoMonitoradoRow,
  EditalEncontradoRow,
  ProcessamentoEditalRow,
} from "@/lib/types/database";
import { throwRepositoryError } from "@/lib/repositories/repository-error";

export type DiscoveredEdital = {
  externalId: string;
  fingerprint: string;
  title: string;
  sourceUrl: string;
  pdfUrl: string | null;
  publishedAt: string | null;
  summary: string | null;
};

export type ProcessedEdital = {
  editalId: string;
  editalUrl: string;
  texto: string;
  materias: string[];
};

export class EditalRepository {
  private readonly supabase = createSupabaseServerClient();

  async recordDiscovered(
    monitorId: string,
    edital: DiscoveredEdital,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("register_edital_found", {
      p_concurso_id: monitorId,
      p_external_id: edital.externalId,
      p_fingerprint: edital.fingerprint,
      p_titulo: edital.title,
      p_source_url: edital.sourceUrl,
      p_edital_url: edital.pdfUrl,
      p_publicado_em: edital.publishedAt,
      p_resumo: edital.summary,
    });

    throwRepositoryError("Falha ao registrar edital encontrado", error);
    return data?.[0]?.created ?? false;
  }

  async claimPending(limit: number): Promise<ProcessamentoEditalRow[]> {
    const { data, error } = await this.supabase.rpc(
      "claim_pending_edital_jobs",
      { p_limit: limit },
    );
    throwRepositoryError("Falha ao reservar processamento de editais", error);
    return data ?? [];
  }

  async getEdital(id: string): Promise<EditalEncontradoRow> {
    const { data, error } = await this.supabase
      .from("editais_encontrados")
      .select("*")
      .eq("id", id)
      .single();

    throwRepositoryError("Falha ao consultar edital", error);
    if (!data) {
      throw new Error("Edital não encontrado.");
    }
    return data;
  }

  async updatePdfUrl(editalId: string, pdfUrl: string): Promise<void> {
    const { error } = await this.supabase
      .from("editais_encontrados")
      .update({ edital_url: pdfUrl })
      .eq("id", editalId);

    throwRepositoryError("Falha ao salvar URL do PDF", error);
  }

  async completeProcessing(
    jobId: string,
    editalId: string,
    texto: string,
    materias: string[],
  ): Promise<void> {
    const processedAt = new Date().toISOString();
    const { error: jobError } = await this.supabase
      .from("processamento_editais")
      .update({
        status: "completed",
        texto_extraido: texto,
        materias,
        processado_em: processedAt,
        locked_until: null,
        ultimo_erro: null,
        updated_at: processedAt,
      })
      .eq("id", jobId);

    throwRepositoryError("Falha ao salvar processamento do edital", jobError);

    const { error: editalError } = await this.supabase
      .from("editais_encontrados")
      .update({ status: "completed" })
      .eq("id", editalId);

    throwRepositoryError("Falha ao atualizar status do edital", editalError);
  }

  async failProcessing(
    job: ProcessamentoEditalRow,
    message: string,
    maxAttempts: number,
  ): Promise<void> {
    const isFinalFailure = job.tentativas >= maxAttempts;
    const retryMinutes = Math.min(5 * 2 ** Math.max(job.tentativas - 1, 0), 360);
    const { error: jobError } = await this.supabase
      .from("processamento_editais")
      .update({
        status: isFinalFailure ? "failed" : "pending",
        next_attempt_at: new Date(
          Date.now() + retryMinutes * 60 * 1000,
        ).toISOString(),
        locked_until: null,
        ultimo_erro: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    throwRepositoryError("Falha ao registrar erro de processamento", jobError);

    const { error: editalError } = await this.supabase
      .from("editais_encontrados")
      .update({ status: isFinalFailure ? "failed" : "queued" })
      .eq("id", job.edital_id);

    throwRepositoryError("Falha ao atualizar estado do edital", editalError);
  }

  async findLatestProcessedForCourse(
    concursoKey: string,
    profissaoKey: string,
  ): Promise<ProcessedEdital | null> {
    const { data: monitors, error: monitorsError } = await this.supabase
      .from("concursos_monitorados")
      .select("id")
      .eq("concurso_key", concursoKey)
      .eq("profissao_key", profissaoKey)
      .eq("ativo", true);

    throwRepositoryError("Falha ao localizar fontes do concurso", monitorsError);
    const monitorIds = (monitors ?? []).map((monitor) => monitor.id);
    if (monitorIds.length === 0) {
      return null;
    }

    const { data: editais, error: editaisError } = await this.supabase
      .from("editais_encontrados")
      .select("id, edital_url, source_url")
      .in("concurso_id", monitorIds)
      .eq("status", "completed")
      .order("publicado_em", { ascending: false, nullsFirst: false })
      .limit(50);

    throwRepositoryError("Falha ao localizar editais processados", editaisError);
    if (!editais?.length) {
      return null;
    }

    const editalIds = editais.map((edital) => edital.id);
    const { data: jobs, error: jobsError } = await this.supabase
      .from("processamento_editais")
      .select("edital_id, texto_extraido, materias")
      .in("edital_id", editalIds)
      .eq("status", "completed")
      .not("texto_extraido", "is", null)
      .order("processado_em", { ascending: false })
      .limit(50);

    throwRepositoryError("Falha ao localizar texto extraído", jobsError);

    for (const job of jobs ?? []) {
      const edital = editais.find((candidate) => candidate.id === job.edital_id);
      if (!edital || !job.texto_extraido) {
        continue;
      }

      const materias = Array.isArray(job.materias)
        ? job.materias.filter(
            (subject): subject is string => typeof subject === "string",
          )
        : [];

      return {
        editalId: edital.id,
        editalUrl: edital.edital_url ?? edital.source_url,
        texto: job.texto_extraido,
        materias,
      };
    }

    return null;
  }
}
