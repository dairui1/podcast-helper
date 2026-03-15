import { createAiSdkRemoteProvider, hasRemoteProviderEnv } from "./ai-sdk-remote";
import { createElevenLabsProvider } from "./elevenlabs";
import { createMlxWhisperProvider, isMlxWhisperAvailable } from "./mlx-whisper";
import type { SttProvider } from "./provider";

interface CreateTranscriptionProviderOptions {
  engine?: string;
  model?: string;
  languageCode?: string;
  pythonExecutable?: string;
  helperScriptPath?: string;
  mlxWhisperAvailable?: boolean;
}

export function createTranscriptionProvider(
  options: CreateTranscriptionProviderOptions
): SttProvider {
  const engine = resolveEngine(options);

  switch (engine) {
    case "elevenlabs":
      return createElevenLabsProvider({
        model: options.model,
        languageCode: options.languageCode,
      });

    case "openai":
    case "groq":
    case "deepgram":
    case "gladia":
    case "assemblyai":
    case "revai":
      return createAiSdkRemoteProvider({
        name: engine,
        model: options.model,
        languageCode: options.languageCode,
      });

    case "mlx-whisper":
    case "whisper-local":
      return createMlxWhisperProvider({
        model: options.model,
        languageCode: options.languageCode,
        pythonExecutable: options.pythonExecutable,
        helperScriptPath: options.helperScriptPath,
      });

    default:
      throw new Error(
        `Unsupported transcription engine: ${engine}. Expected one of: auto, elevenlabs, openai, groq, deepgram, gladia, assemblyai, revai, mlx-whisper.`
      );
  }
}

function resolveEngine(options: CreateTranscriptionProviderOptions): string {
  if (options.engine !== undefined && options.engine !== "auto") {
    return options.engine;
  }

  const mlxWhisperAvailable =
    options.mlxWhisperAvailable ??
    isMlxWhisperAvailable({
      pythonExecutable: options.pythonExecutable,
      helperScriptPath: options.helperScriptPath,
    });

  if (mlxWhisperAvailable) {
    return "mlx-whisper";
  }

  if (hasRemoteProviderEnv("elevenlabs")) {
    return "elevenlabs";
  }

  if (hasRemoteProviderEnv("openai")) {
    return "openai";
  }

  if (hasRemoteProviderEnv("groq")) {
    return "groq";
  }

  if (hasRemoteProviderEnv("deepgram")) {
    return "deepgram";
  }

  if (hasRemoteProviderEnv("gladia")) {
    return "gladia";
  }

  if (hasRemoteProviderEnv("assemblyai")) {
    return "assemblyai";
  }

  if (hasRemoteProviderEnv("revai")) {
    return "revai";
  }

  return "mlx-whisper";
}
