import { throwRepositoryError } from "@/lib/repositories/repository-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AulaRow, CourseSubject, MateriaRow } from "@/lib/types/database";
import type { ReviewCourse } from "@/lib/types/course-review";

export class CourseReviewRepository {
  private readonly supabase = createSupabaseServerClient();

  async listDrafts(): Promise<ReviewCourse[]> {
    const { data: courses, error: coursesError } = await this.supabase
      .from("cursos")
      .select("id, concurso, profissao, titulo, descricao, edital_url, created_at")
      .eq("status", "draft")
      .order("created_at", { ascending: true })
      .limit(50);

    throwRepositoryError("Falha ao listar cursos para revisão", coursesError);
    if (!courses?.length) {
      return [];
    }

    const courseIds = courses.map((course) => course.id);
    const { data: subjects, error: subjectsError } = await this.supabase
      .from("materias")
      .select("id, curso_id, nome, ordem")
      .in("curso_id", courseIds)
      .order("ordem", { ascending: true });

    throwRepositoryError("Falha ao listar matérias para revisão", subjectsError);
    const subjectRows = (subjects ?? []) as Pick<
      MateriaRow,
      "id" | "curso_id" | "nome" | "ordem"
    >[];
    const subjectIds = subjectRows.map((subject) => subject.id);

    const lessonsBySubject = new Map<string, Pick<
      AulaRow,
      "id" | "materia_id" | "titulo" | "conteudo" | "ordem"
    >[]>();

    if (subjectIds.length) {
      const { data: lessons, error: lessonsError } = await this.supabase
        .from("aulas")
        .select("id, materia_id, titulo, conteudo, ordem")
        .in("materia_id", subjectIds)
        .order("ordem", { ascending: true });

      throwRepositoryError("Falha ao listar aulas para revisão", lessonsError);
      for (const lesson of lessons ?? []) {
        const subjectLessons = lessonsBySubject.get(lesson.materia_id) ?? [];
        subjectLessons.push(lesson);
        lessonsBySubject.set(lesson.materia_id, subjectLessons);
      }
    }

    const subjectsByCourse = new Map<string, ReviewCourse["subjects"]>();
    for (const subject of subjectRows) {
      const courseSubjects = subjectsByCourse.get(subject.curso_id) ?? [];
      courseSubjects.push({
        id: subject.id,
        name: subject.nome,
        order: subject.ordem,
        lessons: (lessonsBySubject.get(subject.id) ?? []).map((lesson) => ({
          id: lesson.id,
          title: lesson.titulo,
          content: lesson.conteudo ?? "",
          order: lesson.ordem,
        })),
      });
      subjectsByCourse.set(subject.curso_id, courseSubjects);
    }

    return courses.map((course) => ({
      id: course.id,
      contest: course.concurso,
      profession: course.profissao,
      title: course.titulo,
      description: course.descricao ?? "",
      editalUrl: course.edital_url,
      createdAt: course.created_at,
      subjects: subjectsByCourse.get(course.id) ?? [],
    }));
  }

  async review(
    courseId: string,
    title: string,
    description: string,
    subjects: CourseSubject[],
    approve: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("review_course_draft", {
      p_curso_id: courseId,
      p_titulo: title,
      p_descricao: description,
      p_materias: subjects.map((subject) => ({
        name: subject.name,
        lessons: subject.lessons.map((lesson) => ({
          title: lesson.title,
          content: lesson.content,
        })),
      })),
      p_aprovar: approve,
    });

    throwRepositoryError("Falha ao salvar revisão do curso", error);
  }
}
