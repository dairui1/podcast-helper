import { createRequire } from "node:module";

import { Command } from "commander";

import { createDefaultSourceAdapters } from "./sources";
import { createTranscriptionProvider } from "./transcribe/factory";
import type { WorkflowEvent } from "./transcribe/types";
import { transcribeInput } from "./transcribe/workflow";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const program = new Command()
  .name("podcast-helper")
  .description("Download podcast audio and generate transcript artifacts.")
  .version(packageJson.version);

program
  .command("transcribe")
  .argument("<input>", "Episode URL, direct audio URL, or local audio file")
  .option("-o, --output-dir <dir>", "Directory for generated artifacts", process.cwd())
  .option(
    "--engine <engine>",
    "Transcription engine: auto, elevenlabs, openai, groq, deepgram, gladia, assemblyai, revai, or mlx-whisper",
    "auto"
  )
  .option(
    "--model <model>",
    "Transcription model. Hosted providers use provider-specific model ids; mlx-whisper uses a local path or Hugging Face repo."
  )
  .option("--language <code>", "Force transcription language")
  .option(
    "--python-executable <path>",
    "Python interpreter for local mlx-whisper runs",
    process.env.PODCAST_HELPER_PYTHON || process.env.MLX_WHISPER_PYTHON || "python3"
  )
  .option(
    "--chunk-duration <seconds>",
    "Chunk duration in seconds. Defaults to 300 for mlx-whisper and 0 for hosted providers; auto follows the selected engine."
  )
  .option("--keep-temp", "Keep the per-request temp workspace for debugging", false)
  .option(
    "--progress <mode>",
    "Progress output mode: plain, jsonl, or none",
    "plain"
  )
  .option("--json", "Print a machine-readable manifest to stdout", false)
  .action(async (input, options) => {
    const progressMode = parseProgressMode(options.progress);
    const result = await transcribeInput({
      input,
      outputDir: options.outputDir,
      sourceAdapters: createDefaultSourceAdapters(),
      provider: createTranscriptionProvider({
        engine: options.engine,
        model: options.model,
        languageCode: options.language,
        pythonExecutable: options.pythonExecutable,
      }),
      chunkDurationSec: parseChunkDuration(options.chunkDuration),
      keepTemp: Boolean(options.keepTemp),
      onEvent(event: WorkflowEvent) {
        renderWorkflowEvent(event, progressMode);
      },
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    process.stdout.write(`audio\t${result.artifacts.audio}\n`);
    process.stdout.write(`srt\t${result.artifacts.srt}\n`);
    process.stdout.write(`txt\t${result.artifacts.txt}\n`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function parseChunkDuration(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid chunk duration: ${value}`);
  }

  return parsed;
}

function parseProgressMode(value: string): "plain" | "jsonl" | "none" {
  switch (value) {
    case "plain":
    case "jsonl":
    case "none":
      return value;
    default:
      throw new Error(`Invalid progress mode: ${value}. Expected plain, jsonl, or none.`);
  }
}

function renderWorkflowEvent(
  event: WorkflowEvent,
  mode: "plain" | "jsonl" | "none"
): void {
  if (mode === "none") {
    return;
  }

  if (mode === "jsonl") {
    process.stderr.write(`${JSON.stringify(event)}\n`);
    return;
  }

  if (event.type === "transcript.partial" && typeof event.data?.text === "string") {
    const chunkIndex = typeof event.data.chunkIndex === "number" ? event.data.chunkIndex + 1 : "?";
    const chunkCount = typeof event.data.chunkCount === "number" ? event.data.chunkCount : "?";
    process.stderr.write(`Partial transcript ${chunkIndex}/${chunkCount}: ${event.data.text}\n`);
    return;
  }

  process.stderr.write(`${event.message}\n`);
}
