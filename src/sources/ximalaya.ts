import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const XIMALAYA_HOST_PATTERN = /^(?:www\.)?ximalaya\.com$/i;
const XIMALAYA_SOUND_PATTERN = /^\/sound\/(\d+)/;

export function parseXimalayaUrl(input: string): { trackId: string } | undefined {
  try {
    const url = new URL(input);
    if (!XIMALAYA_HOST_PATTERN.test(url.hostname)) {
      return undefined;
    }
    const match = url.pathname.match(XIMALAYA_SOUND_PATTERN);
    if (match?.[1]) {
      return { trackId: match[1] };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function extractXimalayaAudioFromPlayResponse(
  responseBody: unknown
): { audioUrl: string; title?: string } | undefined {
  if (!isRecord(responseBody)) {
    return undefined;
  }

  const data = isRecord(responseBody.data) ? responseBody.data : responseBody;

  if (Array.isArray(data.tracksForAudioPlay) && data.tracksForAudioPlay.length > 0) {
    const track = data.tracksForAudioPlay[0] as Record<string, unknown>;
    const src = track.src ?? track.playUrl ?? track.play_path ?? track.mp3;
    if (typeof src === "string" && src.length > 0) {
      const title = typeof track.trackName === "string" ? track.trackName : undefined;
      return { audioUrl: src, title };
    }
  }

  const src = data.src ?? data.playUrl ?? data.play_path ?? data.mp3;
  if (typeof src === "string" && src.length > 0) {
    return { audioUrl: src };
  }

  return undefined;
}

export function createXimalayaSourceAdapter(fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      return parseXimalayaUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parseXimalayaUrl(input);
      if (!parsed) {
        throw new Error("Not a Ximalaya URL.");
      }

      const playApiUrl = `https://www.ximalaya.com/revision/play/tracks?trackIds=${parsed.trackId}`;
      const response = await fetchImpl(playApiUrl, {
        headers: {
          Accept: "application/json",
          Referer: `https://www.ximalaya.com/sound/${parsed.trackId}`,
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Ximalaya play API returned ${response.status} ${response.statusText}`
        );
      }

      const body = (await response.json()) as unknown;
      const result = extractXimalayaAudioFromPlayResponse(body);

      if (!result) {
        throw new Error(
          "Could not extract audio URL from Ximalaya. " +
          "The track may be paid/VIP content or the API may require authentication."
        );
      }

      const title = result.title
        ?? await extractTitleFromPage(input, fetchImpl).catch(() => undefined);

      return {
        source: "ximalaya",
        canonicalUrl: input,
        episodeId: parsed.trackId,
        title,
        audioUrl: result.audioUrl,
        suggestedBaseName: `ximalaya-${parsed.trackId}`,
        audioExtension: normalizeAudioExtension(result.audioUrl),
      };
    },
  };
}

async function extractTitleFromPage(
  input: string,
  fetchImpl: FetchLike
): Promise<string | undefined> {
  const response = await fetchImpl(input, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    return undefined;
  }

  const html = await response.text();
  const ogTitleMatch = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  if (ogTitleMatch?.[1]) {
    return decodeEntities(ogTitleMatch[1]);
  }

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  return titleMatch?.[1]?.trim();
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
