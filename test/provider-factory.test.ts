import { afterEach, describe, expect, test, vi } from "vitest";

import { createTranscriptionProvider } from "../src/transcribe/factory";

describe("transcription provider factory", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("prefers local MLX Whisper over ElevenLabs when local support is available", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: true,
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
    });

    expect(provider.name).toBe("mlx-whisper");
  });

  test("creates the ElevenLabs provider by default when local MLX Whisper is unavailable and ELEVENLABS_API_KEY is present", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
    });

    expect(provider.name).toBe("elevenlabs");
  });

  test("prefers OpenAI when local MLX Whisper is unavailable and OPENAI_API_KEY is present", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
    });

    expect(provider.name).toBe("openai");
  });

  test("prefers Groq when local MLX Whisper is unavailable and GROQ_API_KEY is present", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "groq-key");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
    });

    expect(provider.name).toBe("groq");
  });

  test("prefers Deepgram when local MLX Whisper is unavailable and DEEPGRAM_API_KEY is present", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("DEEPGRAM_API_KEY", "deepgram-key");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
    });

    expect(provider.name).toBe("deepgram");
  });

  test("falls back to MLX Whisper by default when ELEVENLABS_API_KEY is missing", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("DEEPGRAM_API_KEY", "");
    vi.stubEnv("GLADIA_API_KEY", "");
    vi.stubEnv("ASSEMBLYAI_API_KEY", "");
    vi.stubEnv("REVAI_API_KEY", "");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
    });

    expect(provider.name).toBe("mlx-whisper");
  });

  test("treats a blank ELEVENLABS_API_KEY as missing and falls back to MLX Whisper", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "   ");

    const provider = createTranscriptionProvider({
      mlxWhisperAvailable: false,
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
    });

    expect(provider.name).toBe("mlx-whisper");
  });

  test("creates the MLX Whisper provider when requested", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");

    const provider = createTranscriptionProvider({
      engine: "mlx-whisper",
      pythonExecutable: "/usr/bin/python3",
      helperScriptPath: "/tmp/mlx-whisper-helper.py",
    });

    expect(provider.name).toBe("mlx-whisper");
  });

  test("creates the ElevenLabs provider when explicitly requested even without ELEVENLABS_API_KEY", () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const provider = createTranscriptionProvider({
      engine: "elevenlabs",
    });

    expect(provider.name).toBe("elevenlabs");
  });

  test.each([
    ["openai"],
    ["groq"],
    ["deepgram"],
    ["gladia"],
    ["assemblyai"],
    ["revai"],
  ])("creates the %s provider when explicitly requested", (engine) => {
    const provider = createTranscriptionProvider({
      engine,
    });

    expect(provider.name).toBe(engine);
  });

  test("rejects unsupported engines", () => {
    expect(() =>
      createTranscriptionProvider({
        engine: "unsupported-engine",
        mlxWhisperAvailable: false,
      })
    ).toThrow(/Unsupported transcription engine/i);
  });
});
