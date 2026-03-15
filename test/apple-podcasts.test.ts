import { describe, expect, test } from "vitest";

import {
  createApplePodcastsSourceAdapter,
  findEpisodeInLookupResults,
  parseApplePodcastsUrl,
} from "../src/sources/apple-podcasts";

describe("apple podcasts source resolver", () => {
  test("parses standard Apple Podcasts episode URL", () => {
    const result = parseApplePodcastsUrl(
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000755074996"
    );
    expect(result).toEqual({
      collectionId: "1200361736",
      episodeTrackId: "1000755074996",
    });
  });

  test("parses show-only URL without episode param", () => {
    const result = parseApplePodcastsUrl(
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736"
    );
    expect(result).toEqual({
      collectionId: "1200361736",
      episodeTrackId: undefined,
    });
  });

  test("parses non-US country code URL", () => {
    const result = parseApplePodcastsUrl(
      "https://podcasts.apple.com/cn/podcast/some-show/id9876543?i=1000123456"
    );
    expect(result).toEqual({
      collectionId: "9876543",
      episodeTrackId: "1000123456",
    });
  });

  test("rejects non-Apple Podcasts URL", () => {
    expect(parseApplePodcastsUrl("https://example.com/podcast")).toBeUndefined();
    expect(parseApplePodcastsUrl("https://podcasts.apple.com/")).toBeUndefined();
    expect(parseApplePodcastsUrl("not-a-url")).toBeUndefined();
  });

  test("finds episode by trackId in lookup results", () => {
    const results = [
      { wrapperType: "track", kind: "podcast", trackId: 1200361736, feedUrl: "https://feed.example.com" },
      { wrapperType: "podcastEpisode", trackId: 1000755074996, trackName: "Episode 1", episodeUrl: "https://cdn.example.com/ep1.mp3" },
      { wrapperType: "podcastEpisode", trackId: 1000755099999, trackName: "Episode 2", episodeUrl: "https://cdn.example.com/ep2.mp3" },
    ];
    const episode = findEpisodeInLookupResults(results, "1000755074996");
    expect(episode?.trackName).toBe("Episode 1");
    expect(episode?.episodeUrl).toBe("https://cdn.example.com/ep1.mp3");
  });

  test("resolves episode via iTunes Lookup API", async () => {
    const lookupResponse = {
      resultCount: 2,
      results: [
        { wrapperType: "track", kind: "podcast", collectionId: 1200361736, feedUrl: "https://feeds.example.com/daily" },
        {
          wrapperType: "podcastEpisode",
          trackId: 1000755074996,
          trackName: "The Case of Kristie Metcalfe",
          episodeUrl: "https://dts.podtrac.com/redirect.mp3/example.com/episode.mp3",
          episodeFileExtension: "mp3",
        },
      ],
    };

    const adapter = createApplePodcastsSourceAdapter(async (input) => {
      const url = String(input);
      if (url.includes("itunes.apple.com/lookup")) {
        return new Response(JSON.stringify(lookupResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    expect(
      adapter.canResolve("https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000755074996")
    ).toBe(true);

    const resolved = await adapter.resolve(
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000755074996"
    );

    expect(resolved.source).toBe("apple-podcasts");
    expect(resolved.episodeId).toBe("1000755074996");
    expect(resolved.title).toBe("The Case of Kristie Metcalfe");
    expect(resolved.audioUrl).toBe("https://dts.podtrac.com/redirect.mp3/example.com/episode.mp3");
    expect(resolved.audioExtension).toBe(".mp3");
    expect(resolved.suggestedBaseName).toBe("apple-podcasts-1000755074996");
  });

  test("falls back to RSS feed when episode not in lookup results", async () => {
    const lookupResponse = {
      resultCount: 1,
      results: [
        { wrapperType: "track", kind: "podcast", collectionId: 1200361736, feedUrl: "https://feeds.example.com/daily.xml" },
      ],
    };

    const feedXml = `
      <rss version="2.0">
        <channel>
          <item>
            <title>Old Episode</title>
            <enclosure url="https://cdn.example.com/old-episode.mp3" type="audio/mpeg" />
          </item>
        </channel>
      </rss>
    `;

    const adapter = createApplePodcastsSourceAdapter(async (input) => {
      const url = String(input);
      if (url.includes("itunes.apple.com/lookup")) {
        return new Response(JSON.stringify(lookupResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "https://feeds.example.com/daily.xml") {
        return new Response(feedXml, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    const resolved = await adapter.resolve(
      "https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000999999999"
    );

    expect(resolved.source).toBe("apple-podcasts");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/old-episode.mp3");
  });
});
