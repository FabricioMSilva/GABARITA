import { PDFParse } from "pdf-parse";
import { ConcursoMonitorRepository } from "@/lib/repositories/concurso-monitor.repository";
import { CourseGenerationRepository } from "@/lib/repositories/course-generation.repository";
import { EditalRepository } from "@/lib/repositories/edital.repository";
import type { ProcessamentoEditalRow } from "@/lib/types/database";
import {
  bytesToText,
  fetchExternalResource,
  findPdfLinks,
} from "./external-resource";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_EXTRACTED_TEXT_CHARS = 150_000;
const MAX_ATTEMPTS = 5;

function extractSubjects(text: string): string[] {
  const programStart = text.search(
    /conte[uú]do[s]?\s+program[aá]tico[s]?|programa\s+das\s+provas|objeto\s+de\s+avalia[cç][aã]o/i,
  );
  const source =
    programStart >= 0 ? text.slice(programStart, programStart + 80_000) : text;
  const subjects = new Map<string, string>();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s*(?:\d+(?:\.\d+)*[.)]?\s*)?(?:[-•*]\s*)?/, "")
      .replace(/[:;]\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (line.length < 4 || line.length > 100 || !/[A-Za-zÀ-ÿ]/.test(line)) {
      continue;
    }

    const isHeading =
      line === line.toLocaleUpperCase("pt-BR") ||
      /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}\d\s&,()/\-]{3,80}$/u.test(line);
    if (!isHeading) {
      continue;
    }

    const key = line.toLocaleLowerCase("pt-BR");
    if (
      /edital|conte[uú]do program[aá]tico|programa das provas|concurso p[uú]blico/.test(
        key,
      )
    ) {
      continue;
    }
    subjects.set(key, line);
    if (subjects.size >= 30) {
      break;
    }
  }

  return [...subjects.values()];
}

async function downloadPdf(url: string) {
  const resource = await fetchExternalResource(url, MAX_PDF_BYTES);
  if (
    resource.contentType.toLowerCase().includes("application/pdf") ||
    bytesToText(resource.bytes.slice(0, 5)) === "%PDF-"
  ) {
    return { bytes: resource.bytes, url: resource.finalUrl };
  }

  if (resource.contentType.toLowerCase().includes("text/html")) {
    const pdfUrl = findPdfLinks(bytesToText(resource.bytes), resource.finalUrl)[0];
    if (!pdfUrl) {
      throw new Error("A página do edital não contém um link PDF detectável.");
    }
    const pdf = await fetchExternalResource(pdfUrl, MAX_PDF_BYTES);
    if (bytesToText(pdf.bytes.slice(0, 5)) !== "%PDF-") {
      throw new Error("O link encontrado não retornou um arquivo PDF válido.");
    }
    return { bytes: pdf.bytes, url: pdf.finalUrl };
  }

  throw new Error("A fonte do edital não retornou PDF nem página HTML.");
}

export class EditalProcessorService {
  constructor(
    private readonly editalRepository = new EditalRepository(),
    private readonly monitorRepository = new ConcursoMonitorRepository(),
    private readonly generationRepository = new CourseGenerationRepository(),
  ) {}

  async runBatch(limit = 2) {
    const jobs = await this.editalRepository.claimPending(limit);
    const result = { processed: 0, failed: 0 };

    for (const job of jobs) {
      try {
        await this.process(job);
        result.processed += 1;
      } catch (error) {
        result.failed += 1;
        const message =
          error instanceof Error ? error.message : "Erro desconhecido ao processar edital.";
        await this.editalRepository.failProcessing(job, message, MAX_ATTEMPTS);
      }
    }

    return result;
  }

  private async process(job: ProcessamentoEditalRow) {
    const edital = await this.editalRepository.getEdital(job.edital_id);
    const monitor = await this.monitorRepository.getById(edital.concurso_id);
    const sourceUrl = edital.edital_url ?? edital.source_url;
    const pdf = await downloadPdf(sourceUrl);
    const parser = new PDFParse({ data: pdf.bytes });
    let extractedText: string;

    try {
      const result = await parser.getText();
      extractedText = result.text.trim().slice(0, MAX_EXTRACTED_TEXT_CHARS);
    } finally {
      await parser.destroy();
    }

    if (extractedText.length < 100) {
      throw new Error(
        "O PDF não possui texto suficiente; OCR para documentos escaneados não está configurado.",
      );
    }

    await this.generationRepository.enqueueForMonitor(monitor);
    await this.editalRepository.completeProcessing(
      job.id,
      edital.id,
      extractedText,
      extractSubjects(extractedText),
    );
    if (pdf.url !== edital.edital_url) {
      await this.editalRepository.updatePdfUrl(edital.id, pdf.url);
    }
  }
}
