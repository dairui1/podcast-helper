import type { SourceAdapter } from "./base";

const SPOTIFY_HOST_PATTERN = /^open\.spotify\.com$/i;
const SPOTIFY_EPISODE_PATTERN = /^\/episode\/[A-Za-z0-9]+/;

export function createSpotifySourceAdapter(): SourceAdapter {
  return {
    canResolve(input: string) {
      try {
        const url = new URL(input);
        return (
          SPOTIFY_HOST_PATTERN.test(url.hostname) &&
          SPOTIFY_EPISODE_PATTERN.test(url.pathname)
        );
      } catch {
        return false;
      }
    },

    async resolve(_input: string) {
      throw new Error(
        "Spotify episodes are DRM-protected and cannot be downloaded directly. " +
        "Try finding the same podcast on Apple Podcasts or its RSS feed instead."
      );
    },
  };
}
