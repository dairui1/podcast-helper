import { describe, expect, test } from "vitest";

import {
  createXimalayaSourceAdapter,
  extractXimalayaAudioFromPlayResponse,
  parseXimalayaUrl,
} from "../src/sources/ximalaya";

describe("ximalaya source resolver", () => {
  test("parses Ximalaya sound URL", () => {
    expect(parseXimalayaUrl("https://www.ximalaya.com/sound/3541064")).toEqual({
      trackId: "3541064",
    });
  });

  test("parses Ximalaya URL without www", () => {
    expect(parseXimalayaUrl("https://ximalaya.com/sound/12345")).toEqual({
      trackId: "12345",
    });
  });

  test("rejects non-Ximalaya URLs", () => {
    expect(parseXimalayaUrl("https://example.com/sound/123")).toBeUndefined();
    expect(parseXimalayaUrl("https://www.ximalaya.com/album/123")).toBeUndefined();
  });

  test("extracts audio from tracksForAudioPlay response", () => {
    const body = {
      ret: 200,
      data: {
        tracksForAudioPlay: [
          {
            trackId: 397081747,
            trackName: "Test Track",
            src: "https://aod.cos.tx.xmcdn.com/audio.m4a",
          },
        ],
      },
    };
    expect(extractXimalayaAudioFromPlayResponse(body)).toEqual({
      audioUrl: "https://aod.cos.tx.xmcdn.com/audio.m4a",
      title: "Test Track",
    });
  });

  test("extracts audio URL from legacy response with src field", () => {
    const body = { data: { src: "https://aod.cos.tx.xmcdn.com/audio.m4a" } };
    expect(extractXimalayaAudioFromPlayResponse(body)).toEqual({
      audioUrl: "https://aod.cos.tx.xmcdn.com/audio.m4a",
    });
  });

  test("extracts audio URL from legacy response with playUrl field", () => {
    const body = { data: { playUrl: "https://aod.cos.tx.xmcdn.com/audio.mp3" } };
    expect(extractXimalayaAudioFromPlayResponse(body)).toEqual({
      audioUrl: "https://aod.cos.tx.xmcdn.com/audio.mp3",
    });
  });

  test("returns undefined for empty play API response", () => {
    expect(extractXimalayaAudioFromPlayResponse({ data: {} })).toBeUndefined();
    expect(extractXimalayaAudioFromPlayResponse(null)).toBeUndefined();
  });

  test("resolves episode from play/tracks API", async () => {
    const playResponse = {
      ret: 200,
      msg: "声音播放信息",
      data: {
        tracksForAudioPlay: [
          {
            trackId: 3541064,
            trackName: "Test Episode",
            src: "https://aod.cos.tx.xmcdn.com/test.m4a",
            canPlay: true,
            isPaid: false,
            duration: 1200,
          },
        ],
      },
    };

    const adapter = createXimalayaSourceAdapter(async (input) => {
      const url = String(input);
      if (url.includes("revision/play/tracks")) {
        return new Response(JSON.stringify(playResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        `<html><head><meta property="og:title" content="Fallback Title" /></head></html>`,
        { status: 200 }
      );
    });

    expect(adapter.canResolve("https://www.ximalaya.com/sound/3541064")).toBe(true);

    const resolved = await adapter.resolve("https://www.ximalaya.com/sound/3541064");
    expect(resolved.source).toBe("ximalaya");
    expect(resolved.episodeId).toBe("3541064");
    expect(resolved.audioUrl).toBe("https://aod.cos.tx.xmcdn.com/test.m4a");
    expect(resolved.title).toBe("Test Episode");
    expect(resolved.suggestedBaseName).toBe("ximalaya-3541064");
  });

  test("falls back to page title when trackName is absent", async () => {
    const playResponse = {
      ret: 200,
      data: {
        tracksForAudioPlay: [
          { trackId: 3541064, src: "https://aod.cos.tx.xmcdn.com/test.m4a" },
        ],
      },
    };

    const adapter = createXimalayaSourceAdapter(async (input) => {
      const url = String(input);
      if (url.includes("revision/play/tracks")) {
        return new Response(JSON.stringify(playResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        `<html><head><meta property="og:title" content="Page Title" /></head></html>`,
        { status: 200 }
      );
    });

    const resolved = await adapter.resolve("https://www.ximalaya.com/sound/3541064");
    expect(resolved.title).toBe("Page Title");
  });
});
