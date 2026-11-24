import { isIP } from "node:net";

const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

type ExternalResource = {
  bytes: Uint8Array;
  contentType: string;
  finalUrl: string;
};

function assertSafeHttpsUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    isIP(hostname) ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("A fonte deve usar uma URL HTTPS pública.");
  }

  return url;
}

export async function fetchExternalResource(
  inputUrl: string,
  maxBytes: number,
): Promise<ExternalResource> {
  let url = assertSafeHttpsUrl(inputUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(url, {
      headers: { "User-Agent": "GabaritaContestMonitor/1.0" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("A fonte excedeu o limite de redirecionamentos.");
      }
      url = assertSafeHttpsUrl(new URL(location, url).toString());
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`A fonte respondeu HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body?.cancel();
      throw new Error("O arquivo excede o limite de tamanho permitido.");
    }

    if (!response.body) {
      throw new Error("A fonte retornou uma resposta sem conteúdo.");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error("O arquivo excede o limite de tamanho permitido.");
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return {
      bytes,
      contentType: response.headers.get("content-type") ?? "",
      finalUrl: url.toString(),
    };
  }

  throw new Error("Não foi possível seguir os redirecionamentos da fonte.");
}

export function bytesToText(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export function findPdfLinks(html: string, baseUrl: string): string[] {
  const links = Array.from(
    html.matchAll(/href\s*=\s*["']([^"'<>]+\.pdf(?:\?[^"'<>]*)?)["']/gi),
    (match) => match[1].replace(/&amp;/g, "&"),
  );

  return links.flatMap((link) => {
    try {
      return [assertSafeHttpsUrl(new URL(link, baseUrl).toString()).toString()];
    } catch {
      return [];
    }
  });
}
