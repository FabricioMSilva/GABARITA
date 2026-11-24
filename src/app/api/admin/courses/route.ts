import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/services/admin-auth";
import { CourseReviewRepository } from "@/lib/repositories/course-review.repository";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const courses = await new CourseReviewRepository().listDrafts();
    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Falha ao carregar cursos para revisão:", error);
    return NextResponse.json(
      { error: "Não foi possível carregar os cursos em revisão." },
      { status: 500 },
    );
  }
}
