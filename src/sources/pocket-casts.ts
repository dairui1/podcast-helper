import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const POCKET_CASTS_HOSTS = ["pca.st", "play.pocketcasts.com", "pocketcasts.com"];
const POCKET_CASTS_EPISODE_PATTERN = /\/episode\/([A-Za-z0-9-]+)/;

export function parsePocketCastsUrl(input: string): { episodeId: string } | undefined {
  try {
    const url = new URL(input);
    if (!POCKET_CASTS_HOSTS.includes(url.hostname)) {
      return undefined;
    }
    const match = url.pathname.match(POCKET_CASTS_EPISODE_PATTERN);
    if (match?.[1]) {
      return { episodeId: match[1] };
    }
    if (url.hostname === "pca.st" && url.pathname.length > 1) {
      return { episodeId: url.pathname.slice(1).split("/")[0] };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function extractPocketCastsAudioUrl(html: string): string | undefined {
  const ogAudioMatch = html.match(
    /<meta[^>]*property=["']og:audio["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (ogAudioMatch?.[1]) {
    return decodeEntities(ogAudioMatch[1]);
  }

  const audioSrcMatch = html.match(/<audio[^>]*\bsrc=["']([^"']+)["'][^>]*>/i);
  if (audioSrcMatch?.[1]) {
    return decodeEntities(audioSrcMatch[1]);
  }

  const sourceInAudioMatch = html.match(
    /<audio[^>]*>[\s\S]*?<source[^>]*\bsrc=["']([^"']+)["'][^>]*>/i
  );
  if (sourceInAudioMatch?.[1]) {
    return decodeEntities(sourceInAudioMatch[1]);
  }

  return undefined;
}

export function extractPocketCastsTitle(html: string): string | undefined {
  const ogTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  return ogTitleMatch?.[1] ? decodeEntities(ogTitleMatch[1]) : undefined;
}

export function extractOEmbedUrl(html: string): string | undefined {
  const match = html.match(
    /<link[^>]*type=["']application\/json\+oembed["'][^>]*href=["']([^"']+)["'][^>]*>/i
  );
  if (match?.[1]) {
    return decodeEntities(match[1]);
  }
  const reverseMatch = html.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*type=["']application\/json\+oembed["'][^>]*>/i
  );
  return reverseMatch?.[1] ? decodeEntities(reverseMatch[1]) : undefined;
}

export function extractEmbedUrlFromOEmbed(oembedJson: unknown): string | undefined {
  if (!isRecord(oembedJson)) return undefined;
  const htmlField = oembedJson.html;
  if (typeof htmlField !== "string") return undefined;
  const match = htmlField.match(/src=["']([^"']+)["']/i);
  return match?.[1] ? decodeEntities(match[1]) : undefined;
}

export function createPocketCastsSourceAdapter(fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      return parsePocketCastsUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parsePocketCastsUrl(input);
      if (!parsed) {
        throw new Error("Not a Pocket Casts URL.");
      }

      const headers = {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      };

      const response = await fetchImpl(input, { headers, redirect: "follow" });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch Pocket Casts page: ${response.status} ${response.statusText}`
        );
      }

      const html = await response.text();
      const title = extractPocketCastsTitle(html);
      const canonicalUrl = response.url || input;

      let audioUrl = extractPocketCastsAudioUrl(html);
      if (audioUrl) {
        return buildResult(canonicalUrl, parsed.episodeId, title, audioUrl);
      }

      let oembedUrl = extractOEmbedUrl(html);
      if (!oembedUrl) {
        oembedUrl = `https://pca.st/oembed.json?url=${encodeURIComponent(canonicalUrl)}`;
      }
      const embedPageUrl = await resolveEmbedPageUrl(oembedUrl, fetchImpl);
      if (embedPageUrl) {
        audioUrl = await extractAudioFromEmbedPage(embedPageUrl, fetchImpl);
        if (audioUrl) {
          return buildResult(canonicalUrl, parsed.episodeId, title, audioUrl);
        }
      }

      throw new Error(
        "Could not extract audio URL from Pocket Casts page. " +
        "Try using the podcast RSS feed URL directly."
      );
    },
  };
}

async function resolveEmbedPageUrl(
  oembedUrl: string,
  fetchImpl: FetchLike
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(oembedUrl, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const json = (await response.json()) as unknown;
    return extractEmbedUrlFromOEmbed(json);
  } catch {
    return undefined;
  }
}

async function extractAudioFromEmbedPage(
  embedUrl: string,
  fetchImpl: FetchLike
): Promise<string | undefined> {
  try {
    const response = await fetchImpl(embedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      },
    });
    if (!response.ok) return undefined;
    const html = await response.text();
    return extractPocketCastsAudioUrl(html);
  } catch {
    return undefined;
  }
}

function buildResult(
  canonicalUrl: string,
  episodeId: string,
  title: string | undefined,
  audioUrl: string
): ResolvedEpisode {
  return {
    source: "pocketcasts",
    canonicalUrl,
    episodeId,
    title,
    audioUrl,
    suggestedBaseName: `pocketcasts-${episodeId}`,
    audioExtension: normalizeAudioExtension(audioUrl),
  };
}

function normalizeAudioExtension(audioUrl: string): string | undefined {
  try {
    const pathname = new URL(audioUrl).pathname;
    const match = pathname.match(/(\.[A-Za-z0-9]+)$/);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
