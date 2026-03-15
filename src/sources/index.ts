import type { SourceAdapter } from "./base";
import { createApplePodcastsSourceAdapter } from "./apple-podcasts";
import { createCastroSourceAdapter } from "./castro";
import { createGenericSourceAdapter } from "./generic";
import { createPocketCastsSourceAdapter } from "./pocket-casts";
import { createPodcastAddictSourceAdapter } from "./podcast-addict";
import { createSpotifySourceAdapter } from "./spotify";
import { createXiaoyuzhouSourceAdapter } from "./xiaoyuzhou";
import { createXimalayaSourceAdapter } from "./ximalaya";
import { createYouTubeSourceAdapter } from "./youtube";

export type { ResolvedEpisode, SourceAdapter } from "./base";

export function createDefaultSourceAdapters(
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response> = fetch
): SourceAdapter[] {
  return [
    createXiaoyuzhouSourceAdapter(fetchImpl),
    createApplePodcastsSourceAdapter(fetchImpl),
    createSpotifySourceAdapter(),
    createYouTubeSourceAdapter(fetchImpl),
    createPocketCastsSourceAdapter(fetchImpl),
    createCastroSourceAdapter(fetchImpl),
    createXimalayaSourceAdapter(fetchImpl),
    createPodcastAddictSourceAdapter(fetchImpl),
    createGenericSourceAdapter(fetchImpl),
  ];
}
