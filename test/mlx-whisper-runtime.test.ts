import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDoctorReport,
  getDefaultMlxWhisperPythonPath,
  resolveMlxWhisperPythonExecutable,
  setupMlxWhisper,
} from "../src/transcribe/mlx-whisper-runtime";

describe("mlx-whisper runtime helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-mlx-runtime-"));
    vi.stubEnv("PODCAST_HELPER_HOME", tempDir);
    vi.stubEnv("PODCAST_HELPER_PYTHON", "");
    vi.stubEnv("MLX_WHISPER_PYTHON", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("GLADIA_API_KEY", "");
    vi.stubEnv("ASSEMBLYAI_API_KEY", "");
    vi.stubEnv("REVAI_API_KEY", "");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  test("uses the default installed venv python when present", async () => {
    const defaultPython = getDefaultMlxWhisperPythonPath();
    await mkdir(join(tempDir, "venvs", "mlx-whisper", "bin"), { recursive: true });
    await writeFile(defaultPython, "#!/usr/bin/env python3\n", "utf8");

    expect(resolveMlxWhisperPythonExecutable()).toBe(defaultPython);
  });

  test("doctor recommends setup when local mlx-whisper is not available", async () => {
    const helperScriptPath = join(tempDir, "mlx_whisper_transcribe.py");
    await writeFile(helperScriptPath, "print('ok')\n", "utf8");

    const report = createDoctorReport({
      helperScriptPath,
      platformSupported: true,
      commandFinder(command) {
        switch (command) {
          case "ffmpeg":
            return "/opt/homebrew/bin/ffmpeg";
          case "python3":
            return "/opt/homebrew/bin/python3";
          default:
            return undefined;
        }
      },
      availabilityCheck: () => false,
    });

    expect(report.mlxWhisper.available).toBe(false);
    expect(report.recommendedEngine).toBe("mlx-whisper");
    expect(report.nextSteps).toContain(
      "Run `podcast-helper setup mlx-whisper` to install the local transcription runtime."
    );
  });

  test("setup creates a stable venv and installs mlx-whisper into it", async () => {
    const helperScriptPath = join(tempDir, "mlx_whisper_transcribe.py");
    const venvDir = join(tempDir, "stable-venv");
    const venvPython = join(venvDir, "bin", "python");
    const progressMessages: string[] = [];

    await writeFile(helperScriptPath, "print('ok')\n", "utf8");

    const runner = vi.fn(
      async ({ command, args }: { command: string; args: string[] }) => {
        if (command === "/opt/homebrew/bin/python3" && args.join(" ") === `-m venv ${venvDir}`) {
          await mkdir(join(venvDir, "bin"), { recursive: true });
          await writeFile(venvPython, "#!/usr/bin/env python3\n", "utf8");
        }

        return {
          stdout: "",
          stderr: "",
        };
      }
    );

    const result = await setupMlxWhisper({
      venvDir,
      helperScriptPath,
      platformSupported: true,
      commandFinder(command) {
        switch (command) {
          case "ffmpeg":
            return "/opt/homebrew/bin/ffmpeg";
          case "python3":
            return "/opt/homebrew/bin/python3";
          default:
            return undefined;
        }
      },
      commandRunner: runner,
      availabilityCheck: (runtime) => runtime?.pythonExecutable === venvPython,
      onProgress(message) {
        progressMessages.push(message);
      },
    });

    expect(result.venvDir).toBe(venvDir);
    expect(result.pythonExecutable).toBe(venvPython);
    expect(runner).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        command: "/opt/homebrew/bin/python3",
        args: ["-m", "venv", venvDir],
      })
    );
    expect(runner).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        command: venvPython,
        args: ["-m", "pip", "install", "--upgrade", "pip"],
      })
    );
    expect(runner).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        command: venvPython,
        args: ["-m", "pip", "install", "mlx-whisper"],
      })
    );
    expect(progressMessages).toEqual(
      expect.arrayContaining([
        `Creating virtual environment at ${venvDir}`,
        "Upgrading pip in the mlx-whisper environment",
        "Installing mlx-whisper",
      ])
    );
  });
});
