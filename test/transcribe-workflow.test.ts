import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transcribeInput } from "../src/transcribe/workflow";
import type { SourceAdapter } from "../src/sources/base";
import type { SttProvider } from "../src/transcribe/provider";

describe("transcribe workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-test-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("downloads audio, transcribes it, and writes audio/srt/txt artifacts", async () => {
    const audioBytes = Buffer.from("fake-audio");
    const fakeAudioSource = join(tempDir, "remote.m4a");
    await writeFile(fakeAudioSource, audioBytes);

    const adapter: SourceAdapter = {
      canResolve(input: string) {
        return input.startsWith("https://www.xiaoyuzhoufm.com/");
      },
      async resolve(input: string) {
        return {
          source: "xiaoyuzhou",
          canonicalUrl: input,
          episodeId: "episode-id",
          title: "Test Episode",
          audioUrl: `file://${fakeAudioSource}`,
          suggestedBaseName: "xiaoyuzhou-episode-id",
          audioExtension: ".m4a",
        };
      },
    };

    const provider: SttProvider = {
      name: "fake",
      async transcribe({ audioPath }: { audioPath: string }) {
        expect(audioPath.endsWith(".m4a")).toBe(true);
        return {
          text: "Hello world.\nThis is a test transcript.\n",
          segments: [
            { startMs: 0, endMs: 1725, text: "Hello world." },
            { startMs: 2500, endMs: 5450, text: "This is a test transcript." },
          ],
          language: "en",
        };
      },
    };

    const onEvent = vi.fn(() => {});
    const result = await transcribeInput({
      input: "https://www.xiaoyuzhoufm.com/episode/episode-id",
      outputDir: tempDir,
      sourceAdapters: [adapter],
      provider,
      onEvent,
    });

    expect(result.source).toBe("xiaoyuzhou");
    expect(await readFile(result.artifacts.audio, "utf8")).toBe("fake-audio");
    expect(await readFile(result.artifacts.srt, "utf8")).toContain("Hello world.");
    expect(await readFile(result.artifacts.txt, "utf8")).toBe(
      "Hello world.\nThis is a test transcript.\n"
    );
    expect(onEvent).toHaveBeenCalled();
  });

  test("falls back to downloading a direct remote audio URL when no source adapter matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(Buffer.from("remote-mp3"), {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
          },
        });
      })
    );

    const provider: SttProvider = {
      name: "fake",
      async transcribe({ audioPath }: { audioPath: string }) {
        expect(audioPath.endsWith(".mp3")).toBe(true);
        expect(await readFile(audioPath, "utf8")).toBe("remote-mp3");

        return {
          text: "Remote audio transcript.\n",
          segments: [{ startMs: 0, endMs: 1000, text: "Remote audio transcript." }],
          language: "en",
        };
      },
    };

    const result = await transcribeInput({
      input: "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3",
      outputDir: tempDir,
      sourceAdapters: [],
      provider,
    });

    expect(result.source).toBe("remote-audio-url");
    expect(result.artifacts.audio).toContain("nicole.mp3");
    expect(await readFile(result.artifacts.txt, "utf8")).toBe("Remote audio transcript.\n");
  });
});
