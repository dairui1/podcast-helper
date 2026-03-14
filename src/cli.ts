import { Command } from "commander";

import { createDefaultSourceAdapters } from "./sources";
import { createElevenLabsProvider } from "./transcribe/elevenlabs";
import type { WorkflowEvent } from "./transcribe/types";
import { transcribeInput } from "./transcribe/workflow";

const program = new Command()
  .name("podcast-helper")
  .description("Download podcast audio and generate transcript artifacts.")
  .version("0.1.0");

program
  .command("transcribe")
  .argument("<input>", "Episode URL, direct audio URL, or local audio file")
  .option("-o, --output-dir <dir>", "Directory for generated artifacts", process.cwd())
  .option("--model <model>", "ElevenLabs transcription model", "scribe_v2")
  .option("--language <code>", "Force transcription language")
  .option("--json", "Print a machine-readable manifest to stdout", false)
  .action(async (input, options) => {
    const result = await transcribeInput({
      input,
      outputDir: options.outputDir,
      sourceAdapters: createDefaultSourceAdapters(),
      provider: createElevenLabsProvider({
        model: options.model,
        languageCode: options.language,
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
