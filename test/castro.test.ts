import { describe, expect, test } from "vitest";

import {
  createCastroSourceAdapter,
  extractCastroAudioUrl,
  parseCastroUrl,
} from "../src/sources/castro";

describe("castro source resolver", () => {
  test("parses Castro episode URL", () => {
    expect(parseCastroUrl("https://castro.fm/episode/abc-123")).toEqual({
      episodeId: "abc-123",
    });
  });

  test("rejects non-Castro URLs", () => {
    expect(parseCastroUrl("https://example.com/episode/123")).toBeUndefined();
    expect(parseCastroUrl("https://castro.fm/podcast/123")).toBeUndefined();
  });

  test("extracts audio URL from og:audio meta", () => {
    const html = `
      <html>
        <head>
          <meta property="og:audio" content="https://cdn.example.com/episode.mp3" />
        </head>
      </html>
    `;
    expect(extractCastroAudioUrl(html)).toBe("https://cdn.example.com/episode.mp3");
  });

  test("resolves episode from HTML", async () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Castro Episode" />
          <meta property="og:audio" content="https://cdn.example.com/castro.mp3" />
        </head>
      </html>
    `;

    const adapter = createCastroSourceAdapter(async () => {
      return new Response(html, { status: 200 });
    });

    const resolved = await adapter.resolve("https://castro.fm/episode/test-456");
    expect(resolved.source).toBe("castro");
    expect(resolved.episodeId).toBe("test-456");
    expect(resolved.audioUrl).toBe("https://cdn.example.com/castro.mp3");
    expect(resolved.title).toBe("Castro Episode");
  });
});
