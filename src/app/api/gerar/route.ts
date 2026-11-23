import { NextResponse } from "next/server";
import { z } from "zod";
import { findCourseOrEnqueue } from "@/lib/queue/generation-queue";

const requestSchema = z.object({
  concurso: z.string().trim().min(1).max(120),
  profissao: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "O corpo da requisição deve ser um JSON válido." },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Informe concurso e profissão com até 120 caracteres.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  try {
    const result = await findCourseOrEnqueue(parsed.data);
    const statusCode = result.status === "available" ? 200 : 202;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    console.error("Erro ao iniciar geração de curso:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar ou iniciar a geração do curso." },
      { status: 500 },
    );
  }
}
