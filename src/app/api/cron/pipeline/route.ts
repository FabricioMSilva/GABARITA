import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { ConcursoMonitorService } from "@/lib/services/concurso-monitor.service";
import { CursoGeneratorService } from "@/lib/services/curso-generator.service";
import { EditalProcessorService } from "@/lib/services/edital-processor.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request, secret: string) {
  const authorization = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET não está configurado." },
      { status: 503 },
    );
  }
  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const monitoramento = await new ConcursoMonitorService().runBatch(10);
    const editais = await new EditalProcessorService().runBatch(3);
    const cursos = await new CursoGeneratorService().runBatch(2);

    return NextResponse.json({
      success: true,
      executedAt: new Date().toISOString(),
      monitoramento,
      editais,
      cursos,
    });
  } catch (error) {
    console.error("Falha na execução do pipeline autônomo:", error);
    return NextResponse.json(
      { error: "Falha ao executar o pipeline autônomo." },
      { status: 500 },
    );
  }
}
