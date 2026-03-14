import { describe, expect, test } from "vitest";

import { createTranscriptionProvider } from "../src/transcribe/factory";

describe("transcription provider factory", () => {
  test("creates the ElevenLabs provider by default", () => {
    const provider = createTranscriptionProvider({});

    expect(provider.name).toBe("elevenlabs");
  });

  test("creates the MLX Whisper provider when requested", () => {
    const provider = createTranscriptionProvider({
      engine: "mlx-whisper",
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
    });

    expect(provider.name).toBe("mlx-whisper");
  });

  test("rejects unsupported engines", () => {
    expect(() =>
      createTranscriptionProvider({
        engine: "unsupported-engine",
      })
    ).toThrow(/Unsupported transcription engine/i);
  });
});
