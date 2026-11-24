import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CourseSubject,
  CursoRow,
  FilaGeracaoRow,
} from "@/lib/types/database";
import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { normalizeSearchKey } from "@/lib/utils/normalize-search";

export type GenerationRequest = {
  concurso: string;
  profissao: string;
};

export class CourseGenerationRepository {
  private readonly supabase = createSupabaseServerClient();

  async findReadyCourse(
    concursoKey: string,
    profissaoKey: string,
  ): Promise<CursoRow | null> {
    const { data, error } = await this.supabase
      .from("cursos")
      .select("*")
      .eq("concurso_key", concursoKey)
      .eq("profissao_key", profissaoKey)
      .eq("status", "ready")
      .maybeSingle();

    throwRepositoryError("Falha ao consultar curso disponível", error);
    return data;
  }

  async findDraftCourse(
    concursoKey: string,
    profissaoKey: string,
  ): Promise<CursoRow | null> {
    const { data, error } = await this.supabase
      .from("cursos")
      .select("*")
      .eq("concurso_key", concursoKey)
      .eq("profissao_key", profissaoKey)
      .eq("status", "draft")
      .maybeSingle();

    throwRepositoryError("Falha ao consultar curso em revisão", error);
    return data;
  }

  async findActiveRequest(
    concursoKey: string,
    profissaoKey: string,
  ): Promise<FilaGeracaoRow | null> {
    const { data, error } = await this.supabase
      .from("fila_geracao")
      .select("*")
      .eq("concurso_key", concursoKey)
      .eq("profissao_key", profissaoKey)
      .in("status", ["queued", "processing"])
      .maybeSingle();

    throwRepositoryError("Falha ao consultar solicitação ativa", error);
    return data;
  }

  async enqueue(
    input: GenerationRequest,
  ): Promise<{ id: string; status: "queued" | "processing" }> {
    const concurso = input.concurso.trim().replace(/\s+/g, " ");
    const profissao = input.profissao.trim().replace(/\s+/g, " ");
    const concursoKey = normalizeSearchKey(concurso);
    const profissaoKey = normalizeSearchKey(profissao);
    const { data, error } = await this.supabase
      .from("fila_geracao")
      .insert({
        concurso,
        profissao,
        concurso_key: concursoKey,
        profissao_key: profissaoKey,
      })
      .select("id, status")
      .single();

    if (!error && data) {
      return { id: data.id, status: data.status as "queued" | "processing" };
    }

    if (error?.code === "23505") {
      const active = await this.findActiveRequest(concursoKey, profissaoKey);
      if (active) {
        return { id: active.id, status: active.status as "queued" | "processing" };
      }
    }

    throwRepositoryError("Falha ao adicionar solicitação à fila", error);
    throw new Error("O Supabase não retornou o registro criado na fila.");
  }

  async enqueueForMonitor(
    monitor: { nome: string; profissao: string },
  ): Promise<boolean> {
    const concurso = monitor.nome.trim().replace(/\s+/g, " ");
    const profissao = monitor.profissao.trim().replace(/\s+/g, " ");
    const { error } = await this.supabase.from("fila_geracao").insert({
      concurso,
      profissao,
      concurso_key: normalizeSearchKey(concurso),
      profissao_key: normalizeSearchKey(profissao),
    });

    if (!error) {
      return true;
    }
    if (error.code === "23505") {
      return false;
    }

    throwRepositoryError("Falha ao enfileirar curso do edital", error);
    return false;
  }

  async claimQueued(limit: number): Promise<FilaGeracaoRow[]> {
    const { data, error } = await this.supabase.rpc("claim_generation_jobs", {
      p_limit: limit,
    });
    throwRepositoryError("Falha ao reservar cursos para geração", error);
    return data ?? [];
  }

  async linkExistingCourse(queueId: string, courseId: string): Promise<void> {
    const { error } = await this.supabase.rpc("link_existing_course", {
      p_queue_id: queueId,
      p_curso_id: courseId,
    });
    throwRepositoryError("Falha ao vincular curso existente", error);
  }

  async defer(queueId: string, message: string): Promise<void> {
    const { error } = await this.supabase
      .from("fila_geracao")
      .update({
        status: "queued",
        next_attempt_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        locked_until: null,
        last_error: message.slice(0, 1000),
      })
      .eq("id", queueId);

    throwRepositoryError("Falha ao reagendar geração de curso", error);
  }

  async fail(
    job: FilaGeracaoRow,
    message: string,
    maxAttempts: number,
  ): Promise<void> {
    const isFinalFailure = job.tentativas >= maxAttempts;
    const retryMinutes = Math.min(5 * 2 ** Math.max(job.tentativas - 1, 0), 360);
    const { error } = await this.supabase
      .from("fila_geracao")
      .update({
        status: isFinalFailure ? "failed" : "queued",
        next_attempt_at: new Date(
          Date.now() + retryMinutes * 60 * 1000,
        ).toISOString(),
        locked_until: null,
        last_error: message.slice(0, 1000),
      })
      .eq("id", job.id);

    throwRepositoryError("Falha ao registrar erro de geração", error);
  }

  async publish(
    jobId: string,
    title: string,
    description: string,
    editalUrl: string,
    subjects: CourseSubject[],
  ): Promise<string> {
    const { data, error } = await this.supabase.rpc("create_course_draft", {
      p_queue_id: jobId,
      p_titulo: title,
      p_descricao: description,
      p_edital_url: editalUrl,
      p_materias: subjects,
    });

    throwRepositoryError("Falha ao salvar curso para revisão", error);
    if (!data) {
      throw new Error("O Supabase não retornou o curso gerado.");
    }
    return data;
  }
}
