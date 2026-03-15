import { describe, expect, test } from "vitest";

import {
  createPodcastAddictSourceAdapter,
  parsePodcastAddictUrl,
} from "../src/sources/podcast-addict";

describe("podcast addict source resolver", () => {
  test("parses Podcast Addict episode URL with encoded audio path", () => {
    const result = parsePodcastAddictUrl(
      "https://podcastaddict.com/episode/https%3A%2F%2Fdts.podtrac.com%2Fredirect.mp3%2Faudioboom.com%2Fposts%2F123.mp3&podcastId=456"
    );
    expect(result).toEqual({
      audioUrl: "https://dts.podtrac.com/redirect.mp3/audioboom.com/posts/123.mp3",
      podcastId: "456",
    });
  });

  test("rejects non-Podcast Addict URLs", () => {
    expect(parsePodcastAddictUrl("https://example.com/episode/test")).toBeUndefined();
    expect(parsePodcastAddictUrl("https://podcastaddict.com/podcast/test/123")).toBeUndefined();
  });

  test("resolves episode directly from URL-encoded audio path", async () => {
    const adapter = createPodcastAddictSourceAdapter();

    const resolved = await adapter.resolve(
      "https://podcastaddict.com/episode/https%3A%2F%2Fcdn.example.com%2Fepisode-42.mp3&podcastId=789"
    );

    expect(resolved.source).toBe("podcast-addict");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/episode-42.mp3");
    expect(resolved.audioExtension).toBe(".mp3");
    expect(resolved.episodeId).toBe("episode-42");
  });
});
