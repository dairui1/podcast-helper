import { createElevenLabsProvider } from "./elevenlabs";
import { createMlxWhisperProvider } from "./mlx-whisper";
import type { SttProvider } from "./provider";

interface CreateTranscriptionProviderOptions {
  engine?: string;
  model?: string;
  languageCode?: string;
  pythonExecutable?: string;
  helperScriptPath?: string;
}

export function createTranscriptionProvider(
  options: CreateTranscriptionProviderOptions
): SttProvider {
  const engine = options.engine ?? "elevenlabs";

  switch (engine) {
    case "elevenlabs":
      return createElevenLabsProvider({
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
        `Unsupported transcription engine: ${engine}. Expected one of: elevenlabs, mlx-whisper.`
      );
  }
}
