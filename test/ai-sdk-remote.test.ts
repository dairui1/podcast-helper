import { afterEach, describe, expect, test, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const openAiTranscriptionSpy = vi.fn((modelId: string) => ({
  provider: "openai",
  modelId,
}));
const gladiaTranscriptionSpy = vi.fn(() => ({
  provider: "gladia",
}));
const transcribeSpy = vi.fn(async () => ({
  text: "Hello from AI SDK",
  language: "en",
  segments: [
    {
      startSecond: 0,
      endSecond: 1.25,
      text: "Hello from AI SDK",
    },
  ],
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({
    transcription: openAiTranscriptionSpy,
  }),
}));

vi.mock("@ai-sdk/groq", () => ({
  createGroq: () => ({
    transcription: vi.fn((modelId: string) => ({ provider: "groq", modelId })),
  }),
}));

vi.mock("@ai-sdk/deepgram", () => ({
  createDeepgram: () => ({
    transcription: vi.fn((modelId: string) => ({ provider: "deepgram", modelId })),
  }),
}));

vi.mock("@ai-sdk/gladia", () => ({
  createGladia: () => ({
    transcription: gladiaTranscriptionSpy,
  }),
}));

vi.mock("@ai-sdk/assemblyai", () => ({
  createAssemblyAI: () => ({
    transcription: vi.fn((modelId: string) => ({ provider: "assemblyai", modelId })),
  }),
}));

vi.mock("@ai-sdk/revai", () => ({
  createRevai: () => ({
    transcription: vi.fn((modelId: string) => ({ provider: "revai", modelId })),
  }),
}));

vi.mock("ai", () => ({
  experimental_transcribe: transcribeSpy,
}));

describe("AI SDK remote transcription provider", async () => {
  const { createAiSdkRemoteProvider } = await import("../src/transcribe/ai-sdk-remote");

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("maps OpenAI transcription results into transcript artifacts", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-openai-provider-"));
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("fake-audio"));

    try {
      const provider = createAiSdkRemoteProvider({
        name: "openai",
        languageCode: "en",
      });

      const result = await provider.transcribe({ audioPath });

      expect(openAiTranscriptionSpy).toHaveBeenCalledWith("gpt-4o-mini-transcribe");
      expect(transcribeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.objectContaining({
            provider: "openai",
            modelId: "gpt-4o-mini-transcribe",
          }),
          providerOptions: {
            openai: {
              language: "en",
              timestampGranularities: ["segment"],
            },
          },
        })
      );
      expect(result.text).toBe("Hello from AI SDK\n");
      expect(result.language).toBe("en");
      expect(result.segments).toEqual([
        {
          startMs: 0,
          endMs: 1250,
          text: "Hello from AI SDK",
        },
      ]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("uses Gladia without requiring an explicit model id", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-gladia-provider-"));
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("fake-audio"));

    try {
      const provider = createAiSdkRemoteProvider({
        name: "gladia",
      });

      await provider.transcribe({ audioPath });

      expect(gladiaTranscriptionSpy).toHaveBeenCalledTimes(1);
      expect(transcribeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: {
            gladia: {
              detectLanguage: true,
            },
          },
        })
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("enables Deepgram language detection when no language is forced", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-deepgram-provider-"));
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("fake-audio"));

    try {
      const provider = createAiSdkRemoteProvider({
        name: "deepgram",
      });

      await provider.transcribe({ audioPath });

      expect(transcribeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: {
            deepgram: {
              punctuate: true,
              diarize: true,
              utterances: true,
              detectLanguage: true,
            },
          },
        })
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("passes Gladia language options in the flat providerOptions shape", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "podcast-helper-gladia-language-provider-"));
    const audioPath = join(tempDir, "audio.mp3");
    await writeFile(audioPath, Buffer.from("fake-audio"));

    try {
      const provider = createAiSdkRemoteProvider({
        name: "gladia",
        languageCode: "zh",
      });

      await provider.transcribe({ audioPath });

      expect(transcribeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: {
            gladia: {
              language: "zh",
              enableCodeSwitching: false,
            },
          },
        })
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
