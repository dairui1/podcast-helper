import { describe, expect, test } from "vitest";

import { createApplePodcastsSourceAdapter } from "../src/sources/apple-podcasts";
import { createSpotifySourceAdapter } from "../src/sources/spotify";
import { createYouTubeSourceAdapter } from "../src/sources/youtube";
import { createPocketCastsSourceAdapter } from "../src/sources/pocket-casts";
import { createCastroSourceAdapter } from "../src/sources/castro";
import { createXimalayaSourceAdapter } from "../src/sources/ximalaya";
import { createPodcastAddictSourceAdapter } from "../src/sources/podcast-addict";
import { createGenericSourceAdapter } from "../src/sources/generic";

const LIVE = process.env.LIVE_SOURCE_TEST === "1";

describe.skipIf(!LIVE)("live source adapter tests", () => {
  test(
    "Apple Podcasts: The Daily",
    { timeout: 30_000 },
    async () => {
      const adapter = createApplePodcastsSourceAdapter();
      const resolved = await adapter.resolve(
        "https://podcasts.apple.com/us/podcast/the-sunday-daily-to-save-his-life-our-food-critic/id1200361736?i=1000755382564"
      );
      expect(resolved.source).toBe("apple-podcasts");
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[Apple Podcasts]", {
        episodeId: resolved.episodeId,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
        audioExtension: resolved.audioExtension,
      });
    },
  );

  test("Spotify: rejects with DRM error", async () => {
    const adapter = createSpotifySourceAdapter();
    await expect(
      adapter.resolve("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk")
    ).rejects.toThrow("DRM");
  });

  test(
    "YouTube: video podcast",
    { timeout: 60_000 },
    async () => {
      const adapter = createYouTubeSourceAdapter();
      const resolved = await adapter.resolve(
        "https://www.youtube.com/watch?v=YFjfBk8HI5o"
      );
      expect(resolved.source).toBe("youtube");
      expect(resolved.episodeId).toBe("YFjfBk8HI5o");
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[YouTube]", {
        episodeId: resolved.episodeId,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );

  test(
    "Pocket Casts: episode via pca.st",
    { timeout: 30_000 },
    async () => {
      const adapter = createPocketCastsSourceAdapter();
      const resolved = await adapter.resolve(
        "https://pca.st/episode/c510a66f-f9c0-45c8-bca2-8c0cc1d5f055"
      );
      expect(resolved.source).toBe("pocketcasts");
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[Pocket Casts]", {
        episodeId: resolved.episodeId,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );

  test(
    "Castro: episode page",
    { timeout: 30_000 },
    async () => {
      const adapter = createCastroSourceAdapter();
      const resolved = await adapter.resolve("https://castro.fm/episode/JCaQes");
      expect(resolved.source).toBe("castro");
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[Castro]", {
        episodeId: resolved.episodeId,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );

  test(
    "Ximalaya: free track",
    { timeout: 30_000 },
    async () => {
      const adapter = createXimalayaSourceAdapter();
      const resolved = await adapter.resolve(
        "https://www.ximalaya.com/sound/397081747"
      );
      expect(resolved.source).toBe("ximalaya");
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[Ximalaya]", {
        episodeId: resolved.episodeId,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );

  test(
    "Podcast Addict: episode with encoded audio URL",
    { timeout: 15_000 },
    async () => {
      const adapter = createPodcastAddictSourceAdapter();
      const resolved = await adapter.resolve(
        "https://podcastaddict.com/episode/https%3A%2F%2Ftracking.swap.fm%2Ftrack%2FXvDEoI11TR00olTUO8US%2Fprfx.byspotify.com%2Fe%2Fplay.podtrac.com%2Fnpr-510289%2Ftraffic.megaphone.fm%2FNPR4487739507.mp3%3Ft%3Dpodcast%26e%3Dnx-s1-5733110%26p%3D510289%26d%3D1540%26size%3D24656754&podcastId=2626987"
      );
      expect(resolved.source).toBe("podcast-addict");
      expect(resolved.audioUrl).toContain("NPR4487739507.mp3");
      console.log("[Podcast Addict]", {
        episodeId: resolved.episodeId,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );

  test(
    "Generic: 99% Invisible (RSS discovery)",
    { timeout: 30_000 },
    async () => {
      const adapter = createGenericSourceAdapter();
      const resolved = await adapter.resolve(
        "https://99percentinvisible.org/episode/mini-stories-volume-16/"
      );
      expect(resolved.audioUrl).toBeTruthy();
      console.log("[Generic - 99pi]", {
        source: resolved.source,
        title: resolved.title,
        audioUrl: resolved.audioUrl.slice(0, 120),
      });
    },
  );
});
