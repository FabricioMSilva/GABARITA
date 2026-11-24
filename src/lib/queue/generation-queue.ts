import { CourseGenerationRepository } from "@/lib/repositories/course-generation.repository";
import { normalizeSearchKey } from "@/lib/utils/normalize-search";

type GenerationInput = {
  concurso: string;
  profissao: string;
};

export async function findCourseOrEnqueue(input: GenerationInput) {
  const repository = new CourseGenerationRepository();
  const concursoKey = normalizeSearchKey(input.concurso);
  const profissaoKey = normalizeSearchKey(input.profissao);
  const course = await repository.findReadyCourse(concursoKey, profissaoKey);

  if (course) {
    return {
      status: "available" as const,
      course: { id: course.id, title: course.titulo },
    };
  }

  const draft = await repository.findDraftCourse(concursoKey, profissaoKey);
  if (draft) {
    return {
      status: "review" as const,
      course: { id: draft.id, title: draft.titulo },
      message: "O material está aguardando revisão do administrador.",
    };
  }

  const activeRequest = await repository.findActiveRequest(
    concursoKey,
    profissaoKey,
  );
  const queueEntry =
    activeRequest ??
    (await repository.enqueue(input).then(({ id, status }) => ({
      id,
      status,
    })));

  if (!queueEntry) {
    throw new Error("Não foi possível localizar ou adicionar a solicitação.");
  }

  return {
    status: queueEntry.status,
    queueId: queueEntry.id,
    message: "Avisaremos quando o curso estiver pronto.",
  };
}
