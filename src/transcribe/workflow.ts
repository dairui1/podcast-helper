import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderSrt, renderTxt } from "../output/transcript";
import type { SourceAdapter } from "../sources";
import type { SttProvider } from "./provider";
import type { WorkflowEvent } from "./types";

interface TranscribeInputOptions {
  input: string;
  outputDir: string;
  sourceAdapters: SourceAdapter[];
  provider: SttProvider;
  onEvent?: (event: WorkflowEvent) => void;
}

interface TranscribeResult {
  input: string;
  source: string;
  episodeId?: string;
  language?: string;
  artifacts: {
    audio: string;
    srt: string;
    txt: string;
  };
}

export async function transcribeInput(options: TranscribeInputOptions): Promise<TranscribeResult> {
  const outputDir = resolve(options.outputDir);
  await mkdir(outputDir, { recursive: true });

  const audioArtifact = await materializeAudioInput({
    input: options.input,
    outputDir,
    sourceAdapters: options.sourceAdapters,
    onEvent: options.onEvent,
  });

  const transcript = await options.provider.transcribe({
    audioPath: audioArtifact.audioPath,
    onEvent: options.onEvent,
  });

  const srtPath = join(outputDir, `${audioArtifact.baseName}.srt`);
  const txtPath = join(outputDir, `${audioArtifact.baseName}.txt`);

  await writeFile(srtPath, renderSrt(transcript.segments), "utf8");
  await writeFile(txtPath, transcript.text || renderTxt(transcript.segments), "utf8");

  options.onEvent?.({
    type: "write.completed",
    message: "Wrote transcript artifacts to disk.",
    data: { srtPath, txtPath },
  });

  return {
    input: options.input,
    source: audioArtifact.source,
    episodeId: audioArtifact.episodeId,
    language: transcript.language,
    artifacts: {
      audio: audioArtifact.audioPath,
      srt: srtPath,
      txt: txtPath,
    },
  };
}

async function materializeAudioInput(options: {
  input: string;
  outputDir: string;
  sourceAdapters: SourceAdapter[];
  onEvent?: (event: WorkflowEvent) => void;
}): Promise<{
  source: string;
  episodeId?: string;
  baseName: string;
  audioPath: string;
}> {
  if (looksLikeUrl(options.input)) {
    const adapter = options.sourceAdapters.find((candidate) => candidate.canResolve(options.input));
    if (!adapter) {
      const remoteAudio = resolveRemoteAudioInput(options.input);
      const audioPath = join(
        options.outputDir,
        `${remoteAudio.suggestedBaseName}${remoteAudio.audioExtension}`
      );

      options.onEvent?.({
        type: "download.started",
        message: "Downloading remote audio.",
        data: { audioUrl: options.input },
      });

      await downloadAudio(options.input, audioPath);

      options.onEvent?.({
        type: "download.completed",
        message: "Downloaded remote audio.",
        data: { audioPath },
      });

      return {
        source: remoteAudio.source,
        episodeId: remoteAudio.episodeId,
        baseName: remoteAudio.suggestedBaseName,
        audioPath,
      };
    }

    options.onEvent?.({
      type: "resolve.started",
      message: "Resolving podcast episode metadata.",
      data: { input: options.input },
    });

    const resolved = await adapter.resolve(options.input);
    options.onEvent?.({
      type: "resolve.completed",
      message: "Resolved podcast episode metadata.",
      data: { source: resolved.source, episodeId: resolved.episodeId },
    });

    const extension =
      resolved.audioExtension || extname(new URL(resolved.audioUrl).pathname) || ".audio";
    const audioPath = join(options.outputDir, `${resolved.suggestedBaseName}${extension}`);

    options.onEvent?.({
      type: "download.started",
      message: "Downloading source audio.",
      data: { audioUrl: resolved.audioUrl },
    });

    await downloadAudio(resolved.audioUrl, audioPath);
    options.onEvent?.({
      type: "download.completed",
      message: "Downloaded source audio.",
      data: { audioPath },
    });

    return {
      source: resolved.source,
      episodeId: resolved.episodeId,
      baseName: resolved.suggestedBaseName,
      audioPath,
    };
  }

  const originalPath = resolve(options.input);
  const extension = extname(originalPath) || ".audio";
  const baseName = basename(originalPath, extension);
  const destination = join(options.outputDir, `${baseName}${extension}`);

  if (destination !== originalPath) {
    await copyFile(originalPath, destination);
  }

  return {
    source: "local-file",
    baseName,
    audioPath: destination,
  };
}

async function downloadAudio(audioUrl: string, destination: string): Promise<void> {
  if (audioUrl.startsWith("file://")) {
    await copyFile(fileURLToPath(audioUrl), destination);
    return;
  }

  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
}

function looksLikeUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveRemoteAudioInput(input: string): {
  source: string;
  episodeId?: string;
  title?: string;
  suggestedBaseName: string;
  audioExtension: string;
} {
  const url = new URL(input);
  const pathname = url.pathname;
  const rawExtension = extname(pathname).toLowerCase();
  const audioExtension = rawExtension || ".audio";
  const rawBaseName = basename(pathname, rawExtension || undefined);
  const suggestedBaseName = sanitizeBaseName(rawBaseName || "remote-audio");

  return {
    source: "remote-audio-url",
    suggestedBaseName,
    audioExtension,
  };
}

function sanitizeBaseName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "remote-audio";
}
