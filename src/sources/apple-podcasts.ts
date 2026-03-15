import type { ResolvedEpisode, SourceAdapter } from "./base";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

interface ItunesLookupResult {
  resultCount: number;
  results: ItunesEntry[];
}

interface ItunesEntry {
  wrapperType?: string;
  kind?: string;
  collectionId?: number;
  trackId?: number;
  trackName?: string;
  collectionName?: string;
  episodeUrl?: string;
  previewUrl?: string;
  feedUrl?: string;
  episodeFileExtension?: string;
  episodeGuid?: string;
  releaseDate?: string;
}

const APPLE_PODCASTS_HOST_PATTERN = /^podcasts\.apple\.com$/i;
const APPLE_PODCASTS_PATH_PATTERN = /^\/[a-z]{2}\/podcast\/[^/]+\/id(\d+)/;

export function parseApplePodcastsUrl(input: string): {
  collectionId: string;
  episodeTrackId?: string;
} | undefined {
  try {
    const url = new URL(input);
    if (!APPLE_PODCASTS_HOST_PATTERN.test(url.hostname)) {
      return undefined;
    }

    const pathMatch = url.pathname.match(APPLE_PODCASTS_PATH_PATTERN);
    if (!pathMatch?.[1]) {
      return undefined;
    }

    return {
      collectionId: pathMatch[1],
      episodeTrackId: url.searchParams.get("i") ?? undefined,
    };
  } catch {
    return undefined;
  }
}

export async function lookupItunesEpisodes(
  collectionId: string,
  fetchImpl: FetchLike,
  limit = 30
): Promise<ItunesLookupResult> {
  const apiUrl = `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=${limit}`;

  const response = await fetchImpl(apiUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`iTunes Lookup API returned ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as ItunesLookupResult;
}

export function findEpisodeInLookupResults(
  results: ItunesEntry[],
  episodeTrackId: string
): ItunesEntry | undefined {
  return results.find(
    (entry) =>
      entry.wrapperType === "podcastEpisode" &&
      String(entry.trackId) === episodeTrackId
  );
}

export function createApplePodcastsSourceAdapter(fetchImpl: FetchLike = fetch): SourceAdapter {
  return {
    canResolve(input: string) {
      return parseApplePodcastsUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parseApplePodcastsUrl(input);
      if (!parsed) {
        throw new Error("Not an Apple Podcasts URL.");
      }

      const lookup = await lookupItunesEpisodes(parsed.collectionId, fetchImpl);

      if (!parsed.episodeTrackId) {
        const firstEpisode = lookup.results.find(
          (entry) => entry.wrapperType === "podcastEpisode" && entry.episodeUrl
        );
        if (!firstEpisode?.episodeUrl) {
          throw new Error("No episodes found in Apple Podcasts lookup results.");
        }
        return buildApplePodcastsEpisode(input, firstEpisode);
      }

      const episode = findEpisodeInLookupResults(lookup.results, parsed.episodeTrackId);
      if (episode?.episodeUrl) {
        return buildApplePodcastsEpisode(input, episode);
      }

      const showEntry = lookup.results.find((entry) => entry.kind === "podcast");
      if (showEntry?.feedUrl) {
        return resolveFromRssFeed(input, parsed.episodeTrackId, showEntry.feedUrl, fetchImpl);
      }

      throw new Error(
        "Could not find the episode in Apple Podcasts lookup results or RSS feed."
      );
    },
  };
}

async function resolveFromRssFeed(
  inputUrl: string,
  episodeTrackId: string,
  feedUrl: string,
  fetchImpl: FetchLike
): Promise<ResolvedEpisode> {
  const response = await fetchImpl(feedUrl, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch RSS feed: ${response.status} ${response.statusText}`);
  }

  const feedXml = await response.text();
  const enclosureUrl = extractFirstEnclosureUrl(feedXml);

  if (!enclosureUrl) {
    throw new Error("Could not find audio enclosure in RSS feed.");
  }

  return {
    source: "apple-podcasts",
    canonicalUrl: inputUrl,
    episodeId: episodeTrackId,
    audioUrl: enclosureUrl,
    suggestedBaseName: `apple-podcasts-${episodeTrackId}`,
    audioExtension: normalizeAudioExtension(enclosureUrl),
  };
}

function extractFirstEnclosureUrl(feedXml: string): string | undefined {
  const match = feedXml.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  return match?.[1];
}

function buildApplePodcastsEpisode(inputUrl: string, entry: ItunesEntry): ResolvedEpisode {
  const audioUrl = entry.episodeUrl ?? entry.previewUrl;
  if (!audioUrl) {
    throw new Error("No audio URL found in iTunes lookup entry.");
  }

  const episodeId = String(entry.trackId ?? "unknown");

  return {
    source: "apple-podcasts",
    canonicalUrl: inputUrl,
    episodeId,
    title: entry.trackName,
    audioUrl,
    suggestedBaseName: `apple-podcasts-${episodeId}`,
    audioExtension: entry.episodeFileExtension
      ? `.${entry.episodeFileExtension}`
      : normalizeAudioExtension(audioUrl),
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
