import { NextResponse } from "next/server";
import { z } from "zod";
import { CourseReviewRepository } from "@/lib/repositories/course-review.repository";
import { requireAdmin } from "@/lib/services/admin-auth";

const reviewSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().min(20).max(1000),
  approve: z.boolean(),
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if ("response" in auth) {
    return auth.response;
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Identificador de curso inválido." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "O corpo da requisição deve ser um JSON válido." },
      { status: 400 },
    );
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Revise os campos; cada matéria precisa de ao menos uma aula preenchida.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    await new CourseReviewRepository().review(
      id,
      parsed.data.title,
      parsed.data.description,
      parsed.data.subjects,
      parsed.data.approve,
    );
    return NextResponse.json({
      courseId: id,
      status: parsed.data.approve ? "ready" : "draft",
    });
  } catch (error) {
    console.error("Falha ao salvar revisão do curso:", error);
    return NextResponse.json(
      { error: "Não foi possível salvar a revisão do curso." },
      { status: 500 },
    );
  }
}
