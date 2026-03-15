import { describe, expect, test } from "vitest";

import {
  createPocketCastsSourceAdapter,
  extractEmbedUrlFromOEmbed,
  extractOEmbedUrl,
  extractPocketCastsAudioUrl,
  parsePocketCastsUrl,
} from "../src/sources/pocket-casts";

describe("pocket casts source resolver", () => {
  test("parses pca.st episode URL", () => {
    expect(parsePocketCastsUrl("https://pca.st/episode/abc-123-def")).toEqual({
      episodeId: "abc-123-def",
    });
  });

  test("parses pca.st short URL", () => {
    expect(parsePocketCastsUrl("https://pca.st/abcdef")).toEqual({
      episodeId: "abcdef",
    });
  });

  test("rejects non-Pocket Casts URLs", () => {
    expect(parsePocketCastsUrl("https://example.com/episode/123")).toBeUndefined();
  });

  test("extracts audio URL from og:audio meta", () => {
    const html = `<meta property="og:audio" content="https://cdn.example.com/episode.mp3" />`;
    expect(extractPocketCastsAudioUrl(html)).toBe("https://cdn.example.com/episode.mp3");
  });

  test("extracts audio URL from audio src", () => {
    const html = `<audio src="https://cdn.example.com/episode.mp3" preload="auto"></audio>`;
    expect(extractPocketCastsAudioUrl(html)).toBe("https://cdn.example.com/episode.mp3");
  });

  test("extracts oEmbed URL from link tag", () => {
    const html = `<link rel="alternate" type="application/json+oembed" href="https://pca.st/oembed.json?url=test" />`;
    expect(extractOEmbedUrl(html)).toBe("https://pca.st/oembed.json?url=test");
  });

  test("extracts embed page URL from oEmbed response", () => {
    const oembed = {
      type: "rich",
      html: '<iframe src="https://pca.st/embed/9mjo6ijv" width="100%" height="160"></iframe>',
    };
    expect(extractEmbedUrlFromOEmbed(oembed)).toBe("https://pca.st/embed/9mjo6ijv");
  });

  test("resolves via oEmbed fallback when main page is SPA", async () => {
    const mainHtml = `
      <html><head>
        <meta property="og:title" content="Great Episode" />
        <link rel="alternate" type="application/json+oembed" href="https://pca.st/oembed.json?url=test" />
      </head><body><div id="root"></div></body></html>
    `;
    const oembedJson = {
      type: "rich",
      title: "Great Episode",
      html: '<iframe src="https://pca.st/embed/abc123" width="100%"></iframe>',
    };
    const embedHtml = `
      <html><body><audio src="https://cdn.example.com/great.mp3" preload="auto"></audio></body></html>
    `;

    const adapter = createPocketCastsSourceAdapter(async (input) => {
      const url = String(input);
      if (url.includes("oembed.json")) {
        return new Response(JSON.stringify(oembedJson), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/embed/")) {
        return new Response(embedHtml, { status: 200 });
      }
      return new Response(mainHtml, {
        status: 200,
        headers: {},
      });
    });

    const resolved = await adapter.resolve("https://pca.st/episode/test-123");
    expect(resolved.source).toBe("pocketcasts");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/great.mp3");
    expect(resolved.title).toBe("Great Episode");
  });
});
