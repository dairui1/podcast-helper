import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const CASTRO_HOST = "castro.fm";
const CASTRO_EPISODE_PATTERN = /^\/episode\/([A-Za-z0-9-]+)/;

export function parseCastroUrl(input: string): { episodeId: string } | undefined {
  try {
    const url = new URL(input);
    if (url.hostname !== CASTRO_HOST) {
      return undefined;
    }
    const match = url.pathname.match(CASTRO_EPISODE_PATTERN);
    if (match?.[1]) {
      return { episodeId: match[1] };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function extractCastroAudioUrl(html: string): string | undefined {
  const ogAudioMatch = html.match(
    /<meta[^>]*property=["']og:audio["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (ogAudioMatch?.[1]) {
    return decodeEntities(ogAudioMatch[1]);
  }

  const ogAudioReverseMatch = html.match(
    /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:audio["'][^>]*>/i
  );
  if (ogAudioReverseMatch?.[1]) {
    return decodeEntities(ogAudioReverseMatch[1]);
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

export function extractCastroTitle(html: string): string | undefined {
  const ogTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  return ogTitleMatch?.[1] ? decodeEntities(ogTitleMatch[1]) : undefined;
}

export function createCastroSourceAdapter(fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      return parseCastroUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parseCastroUrl(input);
      if (!parsed) {
        throw new Error("Not a Castro URL.");
      }

      const response = await fetchImpl(input, {
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Castro page: ${response.status} ${response.statusText}`
        );
      }

      const html = await response.text();
      const audioUrl = extractCastroAudioUrl(html);

      if (!audioUrl) {
        throw new Error(
          "Could not extract audio URL from Castro page. " +
          "Try using the podcast RSS feed URL directly."
        );
      }

      const title = extractCastroTitle(html);

      return {
        source: "castro",
        canonicalUrl: input,
        episodeId: parsed.episodeId,
        title,
        audioUrl,
        suggestedBaseName: `castro-${parsed.episodeId}`,
        audioExtension: normalizeAudioExtension(audioUrl),
      };
    },
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
