import { createHash } from "node:crypto";
import Parser from "rss-parser";
import type { ConcursoMonitoradoRow } from "@/lib/types/database";
import { ConcursoMonitorRepository } from "@/lib/repositories/concurso-monitor.repository";
import {
  EditalRepository,
  type DiscoveredEdital,
} from "@/lib/repositories/edital.repository";
import { bytesToText, fetchExternalResource, findPdfLinks } from "./external-resource";
import { normalizeSearchKey } from "@/lib/utils/normalize-search";

type FeedItem = {
  title?: string;
  link?: string;
  guid?: string;
  isoDate?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  summary?: string;
  enclosure?: { url?: string; type?: string };
};

const MAX_FEED_BYTES = 1_500_000;
const parser = new Parser<FeedItem>();

function cleanText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function itemMatchesMonitor(item: FeedItem, monitor: ConcursoMonitoradoRow) {
  const searchableText = normalizeSearchKey(
    cleanText(
      [item.title, item.contentSnippet, item.summary, item.content]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const terms = [monitor.nome, ...monitor.palavras_chave]
    .map(normalizeSearchKey)
    .filter((term) => term.length >= 3);

  return terms.some((term) => searchableText.includes(term));
}

function parsePublishedAt(item: FeedItem) {
  const rawDate = item.isoDate ?? item.pubDate;
  if (!rawDate) {
    return null;
  }
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDiscovery(
  item: FeedItem,
  monitor: ConcursoMonitoradoRow,
): DiscoveredEdital | null {
  const sourceUrl = item.link ?? item.enclosure?.url;
  const title = cleanText(item.title ?? "");
  if (!sourceUrl || !title) {
    return null;
  }

  const enclosureUrl = item.enclosure?.url;
  const content = [item.content, item.summary].filter(Boolean).join(" ");
  const embeddedPdf = findPdfLinks(content, sourceUrl)[0];
  const pdfUrl =
    (item.enclosure?.type?.toLowerCase().includes("pdf") && enclosureUrl) ||
    (enclosureUrl?.toLowerCase().includes(".pdf") ? enclosureUrl : null) ||
    embeddedPdf ||
    (sourceUrl.toLowerCase().includes(".pdf") ? sourceUrl : null);
  const externalId = item.guid ?? sourceUrl;
  const fingerprint = createHash("sha256")
    .update(`${monitor.id}:${externalId}:${sourceUrl}`)
    .digest("hex");

  return {
    externalId: externalId.slice(0, 1000),
    fingerprint,
    title: title.slice(0, 500),
    sourceUrl,
    pdfUrl,
    publishedAt: parsePublishedAt(item),
    summary: cleanText(item.contentSnippet ?? item.summary ?? "").slice(0, 5000) || null,
  };
}

export class ConcursoMonitorService {
  constructor(
    private readonly monitorRepository = new ConcursoMonitorRepository(),
    private readonly editalRepository = new EditalRepository(),
  ) {}

  async runBatch(limit = 10) {
    const monitors = await this.monitorRepository.claimDue(limit);
    const result = {
      checked: 0,
      editaisNew: 0,
      editaisDuplicated: 0,
      failed: 0,
    };

    for (const monitor of monitors) {
      try {
        const resource = await fetchExternalResource(monitor.feed_url, MAX_FEED_BYTES);
        const feed = await parser.parseString(bytesToText(resource.bytes));

        for (const item of feed.items.slice(0, 100)) {
          if (!itemMatchesMonitor(item, monitor)) {
            continue;
          }
          const discovery = toDiscovery(item, monitor);
          if (!discovery) {
            continue;
          }
          const created = await this.editalRepository.recordDiscovered(
            monitor.id,
            discovery,
          );
          if (created) {
            result.editaisNew += 1;
          } else {
            result.editaisDuplicated += 1;
          }
        }

        await this.monitorRepository.markChecked(
          monitor.id,
          monitor.intervalo_minutos,
        );
        result.checked += 1;
      } catch (error) {
        result.failed += 1;
        const message =
          error instanceof Error ? error.message : "Erro desconhecido no feed.";
        await this.monitorRepository.markFailed(
          monitor.id,
          monitor.intervalo_minutos,
          message,
        );
      }
    }

    return result;
  }
}
