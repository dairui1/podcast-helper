import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { readFile } from "node:fs/promises";

import { createAssemblyAI } from "@ai-sdk/assemblyai";
import { createDeepgram } from "@ai-sdk/deepgram";
import { createGladia } from "@ai-sdk/gladia";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createRevai } from "@ai-sdk/revai";
import { experimental_transcribe as transcribe, type TranscriptionModel } from "ai";

import type { SttProvider } from "./provider";
import type { TranscriptResult, TranscriptSegment, WorkflowEvent } from "./types";

type RemoteProviderName =
  | "openai"
  | "groq"
  | "deepgram"
  | "gladia"
  | "assemblyai"
  | "revai";

interface CreateAiSdkRemoteProviderOptions {
  name: RemoteProviderName;
  apiKey?: string;
  model?: string;
  languageCode?: string;
}

interface ProviderSpec {
  defaultModel?: string;
  envVar: string;
  createModel: (apiKey?: string, modelId?: string) => TranscriptionModel;
  providerOptions?: (languageCode?: string) => ProviderOptions | undefined;
}

const PROVIDER_SPECS: Record<RemoteProviderName, ProviderSpec> = {
  openai: {
    defaultModel: "gpt-4o-mini-transcribe",
    envVar: "OPENAI_API_KEY",
    createModel: (apiKey, modelId) => {
      const provider = createOpenAI({ apiKey });
      const resolvedModelId: Parameters<typeof provider.transcription>[0] =
        modelId ?? "gpt-4o-mini-transcribe";
      return provider.transcription(resolvedModelId);
    },
    providerOptions: (languageCode) =>
      languageCode
        ? {
            openai: {
              language: languageCode,
              timestampGranularities: ["segment"],
            },
          }
        : {
            openai: {
              timestampGranularities: ["segment"],
            },
          },
  },
  groq: {
    defaultModel: "whisper-large-v3-turbo",
    envVar: "GROQ_API_KEY",
    createModel: (apiKey, modelId) => {
      const provider = createGroq({ apiKey });
      const resolvedModelId: Parameters<typeof provider.transcription>[0] =
        modelId ?? "whisper-large-v3-turbo";
      return provider.transcription(resolvedModelId);
    },
    providerOptions: (languageCode) =>
      languageCode
        ? {
            groq: {
              language: languageCode,
              responseFormat: "verbose_json",
              timestampGranularities: ["segment"],
            },
          }
        : {
            groq: {
              responseFormat: "verbose_json",
              timestampGranularities: ["segment"],
            },
          },
  },
  deepgram: {
    defaultModel: "nova-3",
    envVar: "DEEPGRAM_API_KEY",
    createModel: (apiKey, modelId) => {
      const provider = createDeepgram({ apiKey });
      const resolvedModelId: Parameters<typeof provider.transcription>[0] = modelId ?? "nova-3";
      return provider.transcription(resolvedModelId);
    },
    providerOptions: (languageCode) =>
      languageCode
        ? {
            deepgram: {
              punctuate: true,
              diarize: true,
              utterances: true,
              language: languageCode,
            },
          }
        : {
            deepgram: {
              punctuate: true,
              diarize: true,
              utterances: true,
              detectLanguage: true,
            },
          },
  },
  gladia: {
    envVar: "GLADIA_API_KEY",
    createModel: (apiKey) => createGladia({ apiKey }).transcription(),
    providerOptions: (languageCode) =>
      languageCode
        ? {
            gladia: {
              language: languageCode,
              enableCodeSwitching: false,
            },
          }
        : {
            gladia: {
              detectLanguage: true,
            },
          },
  },
  assemblyai: {
    defaultModel: "best",
    envVar: "ASSEMBLYAI_API_KEY",
    createModel: (apiKey, modelId) => {
      const provider = createAssemblyAI({ apiKey });
      const resolvedModelId =
        modelId === undefined
          ? "best"
          : (modelId as Parameters<typeof provider.transcription>[0]);
      return provider.transcription(resolvedModelId);
    },
    providerOptions: (languageCode) => ({
      assemblyai: {
        languageCode,
        speakerLabels: true,
      },
    }),
  },
  revai: {
    envVar: "REVAI_API_KEY",
    createModel: (apiKey, modelId) => {
      const provider = createRevai({ apiKey });
      const resolvedModelId =
        modelId === undefined
          ? "machine"
          : (modelId as Parameters<typeof provider.transcription>[0]);
      return provider.transcription(resolvedModelId);
    },
    providerOptions: (languageCode) => ({
      revai: {
        language: languageCode,
      },
    }),
  },
};

export const REMOTE_PROVIDER_ENV_ORDER = [
  "elevenlabs",
  "openai",
  "groq",
  "deepgram",
  "gladia",
  "assemblyai",
  "revai",
] as const;

export function createAiSdkRemoteProvider(
  options: CreateAiSdkRemoteProviderOptions
): SttProvider {
  const spec = PROVIDER_SPECS[options.name];

  return {
    name: options.name,
    async transcribe({
      audioPath,
      onEvent,
    }: {
      audioPath: string;
      workDir?: string;
      onEvent?: (event: WorkflowEvent) => void;
    }): Promise<TranscriptResult> {
      onEvent?.({
        type: "transcribe.started",
        message: `Submitting audio to ${displayProviderName(options.name)}.`,
        data: { provider: options.name },
      });

      const audio = await readFile(audioPath);
      const result = await transcribe({
        model: spec.createModel(options.apiKey, options.model ?? spec.defaultModel),
        audio: new Uint8Array(audio),
        providerOptions: spec.providerOptions?.(options.languageCode),
      });

      const segments = result.segments.map(toTranscriptSegment);
      const transcript = normalizeTranscriptText(result.text);

      onEvent?.({
        type: "transcribe.completed",
        message: `Received transcript from ${displayProviderName(options.name)}.`,
        data: {
          provider: options.name,
          segments: segments.length,
          language: result.language ?? "",
        },
      });

      return {
        text: transcript,
        segments,
        language: result.language,
      };
    },
  };
}

export function hasRemoteProviderEnv(name: keyof typeof PROVIDER_SPECS | "elevenlabs"): boolean {
  switch (name) {
    case "elevenlabs":
      return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
    default:
      return Boolean(process.env[PROVIDER_SPECS[name].envVar]?.trim());
  }
}

function toTranscriptSegment(segment: {
  startSecond: number;
  endSecond: number;
  text: string;
}): TranscriptSegment {
  return {
    startMs: Math.round(segment.startSecond * 1000),
    endMs: Math.round(segment.endSecond * 1000),
    text: segment.text,
  };
}

function normalizeTranscriptText(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

function displayProviderName(name: RemoteProviderName): string {
  switch (name) {
    case "assemblyai":
      return "AssemblyAI";
    case "deepgram":
      return "Deepgram";
    case "gladia":
      return "Gladia";
    case "groq":
      return "Groq";
    case "openai":
      return "OpenAI";
    case "revai":
      return "Rev.ai";
  }
}
