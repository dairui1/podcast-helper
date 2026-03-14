import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMlxWhisperProvider } from "../src/transcribe/mlx-whisper";
import { transcribeInput } from "../src/transcribe/workflow";

const pythonExecutable = process.env.MLX_WHISPER_PYTHON;
const liveTest = pythonExecutable ? test : test.skip;

describe("live mlx-whisper transcription", () => {
  liveTest(
    "transcribes a small public mp3 with local mlx-whisper",
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), "podcast-helper-mlx-live-"));

      try {
        const result = await transcribeInput({
          input: "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3",
          outputDir,
          sourceAdapters: [],
          provider: createMlxWhisperProvider({
            pythonExecutable,
          }),
        });

        const txt = await readFile(result.artifacts.txt, "utf8");

        expect(result.source).toBe("remote-audio-url");
        expect(txt.trim().length).toBeGreaterThan(0);
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
    20 * 60 * 1000
  );
});
