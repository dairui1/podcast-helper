import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const PODCAST_ADDICT_HOST = "podcastaddict.com";
const PODCAST_ADDICT_EPISODE_PATTERN = /^\/episode\//;

export function parsePodcastAddictUrl(
  input: string
): { audioUrl: string; podcastId?: string } | undefined {
  try {
    const url = new URL(input);
    if (url.hostname !== PODCAST_ADDICT_HOST && url.hostname !== `www.${PODCAST_ADDICT_HOST}`) {
      return undefined;
    }

    if (!PODCAST_ADDICT_EPISODE_PATTERN.test(url.pathname)) {
      return undefined;
    }

    const rawPath = url.pathname.replace(/^\/episode\//, "") + url.search;
    if (!rawPath) {
      return undefined;
    }

    const podcastIdMatch = rawPath.match(/[&?]podcastId=(\d+)/);
    const podcastId = podcastIdMatch?.[1];
    const encodedAudioPath = rawPath.replace(/[&?]podcastId=\d+/, "");

    const audioUrl = decodeURIComponent(encodedAudioPath);
    if (!audioUrl.startsWith("http")) {
      return undefined;
    }

    return { audioUrl, podcastId };
  } catch {
    return undefined;
  }
}

export function createPodcastAddictSourceAdapter(_fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      return parsePodcastAddictUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parsePodcastAddictUrl(input);
      if (!parsed) {
        throw new Error("Not a Podcast Addict URL.");
      }

      const audioUrl = parsed.audioUrl;
      const episodeId = deriveEpisodeId(audioUrl);

      return {
        source: "podcast-addict",
        canonicalUrl: input,
        episodeId,
        audioUrl,
        suggestedBaseName: `podcastaddict-${episodeId}`,
        audioExtension: normalizeAudioExtension(audioUrl),
      };
    },
  };
}

function deriveEpisodeId(audioUrl: string): string {
  try {
    const pathname = new URL(audioUrl).pathname;
    const basename = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
    const withoutExtension = basename.replace(/\.[A-Za-z0-9]+$/, "");
    return sanitizeSlug(withoutExtension) || "episode";
  } catch {
    return "episode";
  }
}

function sanitizeSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "episode"
  );
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
