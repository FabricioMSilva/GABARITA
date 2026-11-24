import { z } from "zod";
import { CourseGenerationRepository } from "@/lib/repositories/course-generation.repository";
import { EditalRepository } from "@/lib/repositories/edital.repository";
import { generateRuleBasedCourse } from "@/lib/services/rule-based-course-generator";
import type { CourseSubject, FilaGeracaoRow } from "@/lib/types/database";

const MAX_ATTEMPTS = 5;

const generatedCourseSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(20).max(1000),
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        lessons: z
          .array(
            z.object({
              title: z.string().trim().min(4).max(160),
              content: z.string().trim().min(40).max(12_000),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .min(1)
    .max(30),
});

type GeneratedCourse = z.infer<typeof generatedCourseSchema>;

function generateCourse(
  job: FilaGeracaoRow,
  sourceText: string,
  detectedSubjects: string[],
): GeneratedCourse {
  return generatedCourseSchema.parse(
    generateRuleBasedCourse(job, sourceText, detectedSubjects),
  );
}

export class CursoGeneratorService {
  constructor(
    private readonly generationRepository = new CourseGenerationRepository(),
    private readonly editalRepository = new EditalRepository(),
  ) {}

  async runBatch(limit = 1) {
    const jobs = await this.generationRepository.claimQueued(limit);
    const result = { processed: 0, deferred: 0, failed: 0 };

    for (const job of jobs) {
      try {
        const outcome = await this.process(job);
        result[outcome] += 1;
      } catch (error) {
        result.failed += 1;
        const message =
          error instanceof Error ? error.message : "Erro desconhecido na geração do curso.";
        await this.generationRepository.fail(job, message, MAX_ATTEMPTS);
      }
    }

    return result;
  }

  private async process(
    job: FilaGeracaoRow,
  ): Promise<"processed" | "deferred"> {
    const existingCourse = await this.generationRepository.findReadyCourse(
      job.concurso_key,
      job.profissao_key,
    );
    if (existingCourse) {
      await this.generationRepository.linkExistingCourse(job.id, existingCourse.id);
      return "processed";
    }

    const source = await this.editalRepository.findLatestProcessedForCourse(
      job.concurso_key,
      job.profissao_key,
    );
    if (!source) {
      await this.generationRepository.defer(
        job.id,
        "Aguardando um edital monitorado e processado para este concurso.",
      );
      return "deferred";
    }

    const generated = await generateCourse(job, source.texto, source.materias);
    const subjects: CourseSubject[] = generated.subjects.map((subject) => ({
      name: subject.name,
      lessons: subject.lessons.map((lesson) => ({
        title: lesson.title,
        content: lesson.content,
      })),
    }));

    await this.generationRepository.publish(
      job.id,
      generated.title,
      generated.description,
      source.editalUrl,
      subjects,
    );
    return "processed";
  }
}
