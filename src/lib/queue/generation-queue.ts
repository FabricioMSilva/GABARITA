import { createSupabaseServerClient } from "@/lib/supabase/server";

type GenerationInput = {
  concurso: string;
  profissao: string;
};

type Course = {
  id: string;
  titulo: string;
};

type QueueEntry = {
  id: string;
  status: "queued" | "processing";
};

function normalizeKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export async function findCourseOrEnqueue(input: GenerationInput) {
  const supabase = createSupabaseServerClient();
  const concursoKey = normalizeKey(input.concurso);
  const profissaoKey = normalizeKey(input.profissao);

  const { data: course, error: courseError } = await supabase
    .from("cursos")
    .select("id, titulo")
    .eq("concurso_key", concursoKey)
    .eq("profissao_key", profissaoKey)
    .eq("status", "ready")
    .maybeSingle();

  if (courseError) {
    throw new Error(`Falha ao consultar cursos: ${courseError.message}`);
  }

  if (course) {
    return {
      status: "available" as const,
      course: course as Course,
    };
  }

  const { data: queueEntry, error: queueError } = await supabase
    .from("fila_geracao")
    .insert({
      concurso: input.concurso.trim().replace(/\s+/g, " "),
      profissao: input.profissao.trim().replace(/\s+/g, " "),
      concurso_key: concursoKey,
      profissao_key: profissaoKey,
    })
    .select("id, status")
    .single();

  if (!queueError && queueEntry) {
    return {
      status: "queued" as const,
      queueId: (queueEntry as QueueEntry).id,
      message: "Avisaremos quando o curso estiver pronto.",
    };
  }

  if (queueError?.code === "23505") {
    const { data: activeEntry, error: lookupError } = await supabase
      .from("fila_geracao")
      .select("id, status")
      .eq("concurso_key", concursoKey)
      .eq("profissao_key", profissaoKey)
      .in("status", ["queued", "processing"])
      .maybeSingle();

    if (lookupError) {
      throw new Error(
        `Falha ao consultar solicitação existente: ${lookupError.message}`,
      );
    }

    if (activeEntry) {
      const entry = activeEntry as QueueEntry;
      return {
        status: entry.status,
        queueId: entry.id,
        message: "Avisaremos quando o curso estiver pronto.",
      };
    }
  }

  throw new Error(
    `Falha ao adicionar solicitação à fila: ${queueError?.message ?? "resposta vazia do Supabase"}`,
  );
}
