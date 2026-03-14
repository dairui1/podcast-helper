import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import type { SttProvider } from "./provider";
import type { TranscriptResult, TranscriptSegment, WorkflowEvent } from "./types";

interface CreateMlxWhisperProviderOptions {
  model?: string;
  languageCode?: string;
  pythonExecutable?: string;
  helperScriptPath?: string;
  runner?: CommandRunner;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface CommandRunnerInput {
  command: string;
  args: string[];
  onStderrLine?: (line: string) => void;
}

type CommandRunner = (input: CommandRunnerInput) => Promise<CommandResult>;

interface MlxWhisperPayload {
  text?: unknown;
  language?: unknown;
  segments?: unknown;
}

interface MlxWhisperSegment {
  start?: unknown;
  end?: unknown;
  text?: unknown;
}

export function createMlxWhisperProvider(
  options: CreateMlxWhisperProviderOptions = {}
): SttProvider {
  const runner = options.runner ?? runCommand;
  const pythonExecutable = options.pythonExecutable ?? "python3";
  const helperScriptPath = options.helperScriptPath ?? resolveHelperScriptPath();

  return {
    name: "mlx-whisper",
    async transcribe({
      audioPath,
      onEvent,
    }: {
      audioPath: string;
      onEvent?: (event: WorkflowEvent) => void;
    }): Promise<TranscriptResult> {
      const workDir = await mkdtemp(resolve(tmpdir(), "podcast-helper-mlx-"));
      const outputJsonPath = resolve(workDir, "transcript.json");

      onEvent?.({
        type: "transcribe.started",
        message: "Running local transcription with mlx-whisper.",
        data: {
          provider: "mlx-whisper",
          model: options.model ?? null,
        },
      });

      try {
        const args = [
          helperScriptPath,
          "--audio-path",
          audioPath,
          "--output-json",
          outputJsonPath,
        ];

        if (options.model) {
          args.push("--model", options.model);
        }

        if (options.languageCode) {
          args.push("--language", options.languageCode);
        }

        await runner({
          command: pythonExecutable,
          args,
          onStderrLine(line) {
            const message = line.trim();
            if (!message) {
              return;
            }

            onEvent?.({
              type: "transcribe.started",
              message,
              data: {
                provider: "mlx-whisper",
              },
            });
          },
        });

        const payload = parseMlxWhisperPayload(await readFile(outputJsonPath, "utf8"));
        const segments = mapSegments(payload.segments);
        if (segments.length === 0) {
          throw new Error("mlx-whisper did not return any timestamped segments.");
        }

        const text = normalizeTranscriptText(
          typeof payload.text === "string" && payload.text.trim().length > 0
            ? payload.text
            : segments.map((segment) => segment.text).join("\n")
        );
        const language = typeof payload.language === "string" ? payload.language : undefined;

        onEvent?.({
          type: "transcribe.completed",
          message: "Received transcript from local mlx-whisper.",
          data: {
            provider: "mlx-whisper",
            segments: segments.length,
            language: language ?? "",
          },
        });

        return {
          text,
          language,
          segments,
        };
      } catch (error) {
        throw wrapMlxWhisperError(error);
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },
  };
}

function resolveHelperScriptPath(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../scripts/mlx_whisper_transcribe.py"),
    resolve(currentDir, "../scripts/mlx_whisper_transcribe.py"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not locate mlx_whisper_transcribe.py in the installed package.");
}

async function runCommand({
  command,
  args,
  onStderrLine,
}: CommandRunnerInput): Promise<CommandResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let stderrBuffer = "";

    child.on("error", reject);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const value = chunk.toString();
      stderr += value;
      stderrBuffer += value;

      let newlineIndex = stderrBuffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = stderrBuffer.slice(0, newlineIndex);
        stderrBuffer = stderrBuffer.slice(newlineIndex + 1);
        onStderrLine?.(line);
        newlineIndex = stderrBuffer.indexOf("\n");
      }
    });

    child.on("close", (code) => {
      if (stderrBuffer.length > 0) {
        onStderrLine?.(stderrBuffer);
      }

      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const message = stderr.trim() || stdout.trim() || `Process exited with code ${code}`;
      reject(new Error(message));
    });
  });
}

function parseMlxWhisperPayload(raw: string): MlxWhisperPayload {
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("mlx-whisper returned malformed JSON.");
  }

  return parsed;
}

function mapSegments(rawSegments: unknown): TranscriptSegment[] {
  if (!Array.isArray(rawSegments)) {
    return [];
  }

  return rawSegments.flatMap((segment): TranscriptSegment[] => {
    if (!isRecord(segment)) {
      return [];
    }

    const candidate = segment as MlxWhisperSegment;
    const start = asNumber(candidate.start);
    const end = asNumber(candidate.end);
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";

    if (text.length === 0 || start === null || end === null) {
      return [];
    }

    return [
      {
        startMs: Math.round(start * 1000),
        endMs: Math.round(end * 1000),
        text,
      },
    ];
  });
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeTranscriptText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 0 ? `${trimmed}\n` : "";
}

function wrapMlxWhisperError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof Error && "code" in error ? (error as Error & { code?: string }).code : undefined;

  if (code === "ENOENT" || /No module named ['"]mlx_whisper['"]/.test(message)) {
    return new Error(
      "mlx-whisper is not available. Install it with `python3 -m pip install mlx-whisper` and ensure ffmpeg is installed."
    );
  }

  return new Error(`mlx-whisper failed: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
