import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConcursoMonitoradoRow } from "@/lib/types/database";
import { throwRepositoryError } from "@/lib/repositories/repository-error";

export class ConcursoMonitorRepository {
  private readonly supabase = createSupabaseServerClient();

  async claimDue(limit: number): Promise<ConcursoMonitoradoRow[]> {
    const { data, error } = await this.supabase.rpc("claim_due_concursos", {
      p_limit: limit,
    });
    throwRepositoryError("Falha ao reservar concursos para monitoramento", error);
    return data ?? [];
  }

  async getById(id: string): Promise<ConcursoMonitoradoRow> {
    const { data, error } = await this.supabase
      .from("concursos_monitorados")
      .select("*")
      .eq("id", id)
      .single();

    throwRepositoryError("Falha ao consultar concurso monitorado", error);
    if (!data) {
      throw new Error("Concurso monitorado não encontrado.");
    }
    return data;
  }

  async markChecked(id: string, intervalMinutes: number): Promise<void> {
    const nextCheck = new Date(
      Date.now() + intervalMinutes * 60 * 1000,
    ).toISOString();
    const { error } = await this.supabase
      .from("concursos_monitorados")
      .update({
        ultima_verificacao: new Date().toISOString(),
        proxima_verificacao: nextCheck,
        locked_until: null,
        ultimo_erro: null,
      })
      .eq("id", id);

    throwRepositoryError("Falha ao finalizar monitoramento", error);
  }

  async markFailed(
    id: string,
    intervalMinutes: number,
    message: string,
  ): Promise<void> {
    const retryMinutes = Math.min(Math.max(intervalMinutes, 15), 1440);
    const nextCheck = new Date(
      Date.now() + retryMinutes * 60 * 1000,
    ).toISOString();
    const { error } = await this.supabase
      .from("concursos_monitorados")
      .update({
        ultima_verificacao: new Date().toISOString(),
        proxima_verificacao: nextCheck,
        locked_until: null,
        ultimo_erro: message.slice(0, 1000),
      })
      .eq("id", id);

    throwRepositoryError("Falha ao registrar erro de monitoramento", error);
  }
}
