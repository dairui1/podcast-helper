import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { transcribeInput } from "../src/transcribe/workflow";
import type { SourceAdapter } from "../src/sources/base";
import type { SttProvider } from "../src/transcribe/provider";
import type { AudioChunk } from "../src/audio/ffmpeg";
import type { WorkflowEvent } from "../src/transcribe/types";

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

  test("creates a session temp dir, transcribes chunked audio, streams partial events, and cleans up temp files", async () => {
    const sourceAudioPath = join(tempDir, "episode.mp3");
    const chunkOnePath = join(tempDir, "chunk-000.mp3");
    const chunkTwoPath = join(tempDir, "chunk-001.mp3");

    await writeFile(sourceAudioPath, Buffer.from("source-audio"));
    await writeFile(chunkOnePath, Buffer.from("chunk-one"));
    await writeFile(chunkTwoPath, Buffer.from("chunk-two"));

    const chunker = vi.fn(async (): Promise<AudioChunk[]> => {
      return [
        {
          index: 0,
          audioPath: chunkOnePath,
          offsetMs: 0,
        },
        {
          index: 1,
          audioPath: chunkTwoPath,
          offsetMs: 300_000,
        },
      ];
    });

    const provider: SttProvider = {
      name: "mlx-whisper",
      async transcribe({
        audioPath,
        onEvent,
        workDir,
      }: {
        audioPath: string;
        onEvent?: (event: WorkflowEvent) => void;
        workDir?: string;
      }) {
        expect(workDir).toBeTruthy();
        onEvent?.({
          type: "transcribe.started",
          message: "Provider started chunk.",
          data: { audioPath },
        });

        if (audioPath === chunkOnePath) {
          return {
            text: "First chunk text.\n",
            segments: [{ startMs: 0, endMs: 1_500, text: "First chunk text." }],
            language: "en",
          };
        }

        return {
          text: "Second chunk text.\n",
          segments: [{ startMs: 500, endMs: 2_000, text: "Second chunk text." }],
          language: "en",
        };
      },
    };

    const events: WorkflowEvent[] = [];
    const result = await transcribeInput({
      input: sourceAudioPath,
      outputDir: tempDir,
      sourceAdapters: [],
      provider,
      chunkDurationSec: 300,
      tempRootDir: tempDir,
      audioChunker: chunker,
      onEvent(event) {
        events.push(event);
      },
    });

    expect(chunker).toHaveBeenCalledTimes(1);
    expect(await readFile(result.artifacts.audio, "utf8")).toBe("source-audio");
    expect(await readFile(result.artifacts.txt, "utf8")).toBe("First chunk text.\nSecond chunk text.\n");
    expect(await readFile(result.artifacts.srt, "utf8")).toContain("00:05:00,500 --> 00:05:02,000");

    const sessionStarted = events.find((event) => event.type === "session.started");
    const sessionDir = typeof sessionStarted?.data?.sessionDir === "string" ? sessionStarted.data.sessionDir : "";
    expect(sessionDir).toContain("podcast-helper-session-");
    await expect(access(sessionDir)).rejects.toThrow();

    const partialEvents = events.filter((event) => event.type === "transcript.partial");
    expect(partialEvents).toHaveLength(2);
    expect(partialEvents[0]?.data?.text).toBe("First chunk text.");
    expect(partialEvents[1]?.data?.chunkIndex).toBe(1);
    expect(events.some((event) => event.type === "cleanup.completed")).toBe(true);
  });

  test("keeps the session temp dir when keepTemp is enabled", async () => {
    const sourceAudioPath = join(tempDir, "episode.mp3");
    await writeFile(sourceAudioPath, Buffer.from("source-audio"));

    const provider: SttProvider = {
      name: "mlx-whisper",
      async transcribe() {
        return {
          text: "Only chunk.\n",
          segments: [{ startMs: 0, endMs: 1_000, text: "Only chunk." }],
          language: "en",
        };
      },
    };

    const events: WorkflowEvent[] = [];
    await transcribeInput({
      input: sourceAudioPath,
      outputDir: tempDir,
      sourceAdapters: [],
      provider,
      chunkDurationSec: 0,
      keepTemp: true,
      tempRootDir: tempDir,
      onEvent(event) {
        events.push(event);
      },
    });

    const sessionStarted = events.find((event) => event.type === "session.started");
    const sessionDir = typeof sessionStarted?.data?.sessionDir === "string" ? sessionStarted.data.sessionDir : "";

    await expect(access(sessionDir)).resolves.toBeUndefined();
    expect(events.some((event) => event.type === "cleanup.skipped")).toBe(true);

    await rm(sessionDir, { recursive: true, force: true });
  });

  test("defaults to chunking for mlx-whisper providers when chunk duration is omitted", async () => {
    const sourceAudioPath = join(tempDir, "episode.mp3");
    await writeFile(sourceAudioPath, Buffer.from("source-audio"));

    const chunker = vi.fn(async ({ chunkDurationSec }: { chunkDurationSec: number }) => {
      expect(chunkDurationSec).toBe(300);

      return [
        {
          index: 0,
          audioPath: sourceAudioPath,
          offsetMs: 0,
        },
      ];
    });

    const provider: SttProvider = {
      name: "mlx-whisper",
      async transcribe() {
        return {
          text: "Only chunk.\n",
          segments: [{ startMs: 0, endMs: 1_000, text: "Only chunk." }],
          language: "en",
        };
      },
    };

    await transcribeInput({
      input: sourceAudioPath,
      outputDir: tempDir,
      sourceAdapters: [],
      provider,
      audioChunker: chunker,
    });

    expect(chunker).toHaveBeenCalledTimes(1);
  });

  test("does not chunk by default for elevenlabs providers when chunk duration is omitted", async () => {
    const sourceAudioPath = join(tempDir, "episode.mp3");
    await writeFile(sourceAudioPath, Buffer.from("source-audio"));

    const chunker = vi.fn(async () => {
      throw new Error("chunker should not run");
    });

    const provider: SttProvider = {
      name: "elevenlabs",
      async transcribe({ audioPath }: { audioPath: string }) {
        expect(audioPath.endsWith(".mp3")).toBe(true);

        return {
          text: "Single pass.\n",
          segments: [{ startMs: 0, endMs: 1_000, text: "Single pass." }],
          language: "en",
        };
      },
    };

    await transcribeInput({
      input: sourceAudioPath,
      outputDir: tempDir,
      sourceAdapters: [],
      provider,
      audioChunker: chunker,
    });

    expect(chunker).not.toHaveBeenCalled();
  });
});
