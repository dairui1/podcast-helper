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
  .option("--engine <engine>", "Transcription engine: elevenlabs or mlx-whisper", "elevenlabs")
  .option(
    "--model <model>",
    "Transcription model. ElevenLabs uses a model id; mlx-whisper uses a local path or Hugging Face repo."
  )
  .option("--language <code>", "Force transcription language")
  .option(
    "--python-executable <path>",
    "Python interpreter for local mlx-whisper runs",
    process.env.PODCAST_HELPER_PYTHON || "python3"
  )
  .option("--json", "Print a machine-readable manifest to stdout", false)
  .action(async (input, options) => {
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
      onEvent(event: WorkflowEvent) {
        process.stderr.write(`${event.message}\n`);
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
