import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMlxWhisperProvider } from "../src/transcribe/mlx-whisper";

describe("MLX Whisper transcription provider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-mlx-provider-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("runs the helper script and maps Whisper segments into transcript artifacts", async () => {
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("not-a-real-audio-file"));

    const runner = vi.fn(async ({ command, args }: { command: string; args: string[] }) => {
      expect(command).toBe("/usr/bin/python3");
      expect(args).toContain("/tmp/mlx-whisper-helper.py");
      expect(args).toContain("--audio-path");
      expect(args).toContain(audioPath);
      expect(args).toContain("--model");
      expect(args).toContain("mlx-community/whisper-large-v3-turbo");
      expect(args).toContain("--language");
      expect(args).toContain("zh");

      const outputIndex = args.indexOf("--output-json");
      const outputPath = args[outputIndex + 1];

      await writeFile(
        outputPath,
        JSON.stringify({
          text: "你好，世界。",
          language: "zh",
          segments: [
            { start: 0, end: 1.25, text: " 你好，世界。" },
            { start: 1.8, end: 3.2, text: " 再见。" },
          ],
        }),
        "utf8"
      );

      return {
        stdout: "",
        stderr: "",
      };
    });

    const provider = createMlxWhisperProvider({
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
      model: "mlx-community/whisper-large-v3-turbo",
      languageCode: "zh",
      runner,
    });

    const result = await provider.transcribe({ audioPath });

    expect(result.language).toBe("zh");
    expect(result.text).toBe("你好，世界。\n");
    expect(result.segments).toEqual([
      {
        startMs: 0,
        endMs: 1250,
        text: "你好，世界。",
      },
      {
        startMs: 1800,
        endMs: 3200,
        text: "再见。",
      },
    ]);
  });

  test("surfaces a helpful install message when mlx-whisper is unavailable", async () => {
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("not-a-real-audio-file"));

    const provider = createMlxWhisperProvider({
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
      runner: async () => {
        const error = new Error("python failed");
        (error as Error & { code?: string }).code = "ENOENT";
        throw error;
      },
    });

    await expect(provider.transcribe({ audioPath })).rejects.toThrow(
      /mlx-whisper is not available/i
    );
  });
});
