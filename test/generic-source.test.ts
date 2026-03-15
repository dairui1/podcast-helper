import { describe, expect, test } from "vitest";

import {
  createGenericSourceAdapter,
  extractAudioUrlFromHtml,
  extractFeedLinks,
  parseFeedEntries,
  resolveGenericEpisodeFromHtml,
} from "../src/sources/generic";

describe("generic source resolver", () => {
  test("extracts direct audio metadata from a generic episode page", async () => {
    const html = `
      <html>
        <head>
          <link rel="canonical" href="https://example.fm/episodes/42" />
          <meta property="og:title" content="Episode 42" />
          <meta property="og:audio" content="https://cdn.example.fm/audio/episode-42.mp3" />
        </head>
      </html>
    `;

    expect(extractAudioUrlFromHtml("https://example.fm/episodes/42", html)).toBe(
      "https://cdn.example.fm/audio/episode-42.mp3"
    );

    const resolved = await resolveGenericEpisodeFromHtml({
      inputUrl: "https://example.fm/episodes/42",
      html,
      fetchImpl: async () => {
        throw new Error("feed fetch should not run");
      },
    });

    expect(resolved.source).toBe("example.fm");
    expect(resolved.canonicalUrl).toBe("https://example.fm/episodes/42");
    expect(resolved.title).toBe("Episode 42");
    expect(resolved.audioUrl).toBe("https://cdn.example.fm/audio/episode-42.mp3");
    expect(resolved.suggestedBaseName).toBe("example-fm-episode-42");
    expect(resolved.audioExtension).toBe(".mp3");
  });

  test("handles single-quoted attributes, source tags, and JSON-LD audio metadata", async () => {
    const html = `
      <html>
        <head>
          <meta content='Podcast Episode' property='og:title' />
          <script type='application/ld+json'>
            {
              "@context": "https://schema.org",
              "@type": "PodcastEpisode",
              "associatedMedia": {
                "@type": "AudioObject",
                "url": "https://cdn.example.com/jsonld-episode.mp3"
              }
            }
          </script>
        </head>
        <body>
          <audio controls>
            <source type='audio/mpeg' src='/audio/source-tag.mp3' />
          </audio>
        </body>
      </html>
    `;

    expect(extractAudioUrlFromHtml("https://example.com/episodes/99", html)).toBe(
      "https://example.com/audio/source-tag.mp3"
    );

    const resolved = await resolveGenericEpisodeFromHtml({
      inputUrl: "https://example.com/episodes/99",
      html,
      fetchImpl: async () => {
        throw new Error("feed fetch should not run");
      },
    });

    expect(resolved.title).toBe("Podcast Episode");
    expect(resolved.audioUrl).toBe("https://example.com/audio/source-tag.mp3");
  });

  test("falls back to RSS discovery when the page exposes a matching podcast feed", async () => {
    const html = `
      <html>
        <head>
          <link rel="canonical" href="https://show.example.com/episodes/my-episode" />
          <meta property="og:title" content="My Episode" />
          <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
        </head>
      </html>
    `;

    const feedXml = `
      <rss version="2.0">
        <channel>
          <title>Example Show</title>
          <item>
            <title>My Episode</title>
            <link>https://show.example.com/episodes/my-episode</link>
            <guid>https://show.example.com/episodes/my-episode</guid>
            <enclosure url="https://cdn.show.example.com/my-episode.m4a" type="audio/x-m4a" />
          </item>
        </channel>
      </rss>
    `;

    expect(extractFeedLinks("https://show.example.com/episodes/my-episode", html)).toEqual([
      "https://show.example.com/feed.xml",
    ]);
    expect(parseFeedEntries(feedXml)).toHaveLength(1);

    const resolved = await resolveGenericEpisodeFromHtml({
      inputUrl: "https://show.example.com/episodes/my-episode",
      html,
      fetchImpl: async (input) => {
        expect(String(input)).toBe("https://show.example.com/feed.xml");

        return new Response(feedXml, {
          status: 200,
          headers: {
            "content-type": "application/rss+xml",
          },
        });
      },
    });

    expect(resolved.source).toBe("show.example.com");
    expect(resolved.episodeId).toBe("my-episode");
    expect(resolved.audioUrl).toBe("https://cdn.show.example.com/my-episode.m4a");
    expect(resolved.suggestedBaseName).toBe("show-example-com-my-episode");
    expect(resolved.audioExtension).toBe(".m4a");
  });

  test("parses feed discovery and enclosure links with mixed attribute order", async () => {
    const html = `
      <html>
        <head>
          <link href='/rss.xml' type='application/rss+xml' rel='alternate' />
        </head>
      </html>
    `;

    const feedXml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Episode Title</title>
          <id>https://feeds.example.com/episodes/ep-5</id>
          <link rel='enclosure' type='audio/mpeg' href='https://cdn.example.com/ep-5.mp3' />
          <link href='https://feeds.example.com/episodes/ep-5' rel='alternate' />
        </entry>
      </feed>
    `;

    expect(extractFeedLinks("https://feeds.example.com/episodes/ep-5", html)).toEqual([
      "https://feeds.example.com/rss.xml",
    ]);
    expect(parseFeedEntries(feedXml)).toEqual([
      {
        title: "Episode Title",
        link: "https://feeds.example.com/episodes/ep-5",
        guid: "https://feeds.example.com/episodes/ep-5",
        audioUrl: "https://cdn.example.com/ep-5.mp3",
      },
    ]);
  });

  test("generic adapter ignores direct audio URLs and resolves regular web pages", async () => {
    const adapter = createGenericSourceAdapter(async () => {
      return new Response(
        `
          <html>
            <head>
              <meta property="og:title" content="Podcast episode" />
              <meta property="og:audio" content="https://cdn.example.com/episode.mp3" />
            </head>
          </html>
        `,
        { status: 200 }
      );
    });

    expect(adapter.canResolve("https://cdn.example.com/episode.mp3")).toBe(false);
    expect(adapter.canResolve("https://example.com/episodes/123")).toBe(true);

    const resolved = await adapter.resolve("https://example.com/episodes/123");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/episode.mp3");
  });

  test("generic adapter ignores audio URLs that only expose the filename in query params", () => {
    const adapter = createGenericSourceAdapter();

    expect(
      adapter.canResolve("https://cdn.example.com/download?filename=episode.mp3&token=123")
    ).toBe(false);
  });

  test("generic adapter treats direct audio responses as remote audio inputs", async () => {
    const adapter = createGenericSourceAdapter(async () => {
      return new Response("fake-audio", {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-disposition": 'attachment; filename="episode-final.mp3"',
        },
      });
    });

    const resolved = await adapter.resolve("https://cdn.example.com/download?id=123");

    expect(resolved.source).toBe("remote-audio-url");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/download?id=123");
    expect(resolved.suggestedBaseName).toBe("episode-final");
    expect(resolved.audioExtension).toBe(".mp3");
  });
});
