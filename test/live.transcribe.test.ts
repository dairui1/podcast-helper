import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createElevenLabsProvider } from "../src/transcribe/elevenlabs";
import { transcribeInput } from "../src/transcribe/workflow";

const apiKey = process.env.ELEVENLABS_API_KEY;
const liveTest = apiKey ? test : test.skip;

describe("live transcription", () => {
  liveTest(
    "transcribes a small public mp3 with ElevenLabs",
    async () => {
      const outputDir = await mkdtemp(join(tmpdir(), "podcast-helper-live-"));

      try {
        const result = await transcribeInput({
          input: "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3",
          outputDir,
          sourceAdapters: [],
          provider: createElevenLabsProvider({
            apiKey,
            model: "scribe_v2",
          }),
        });

        const txt = await readFile(result.artifacts.txt, "utf8");

        expect(result.source).toBe("remote-audio-url");
        expect(txt.length).toBeGreaterThan(20);
        expect(txt.trim().length).toBeGreaterThan(0);
      } finally {
        await rm(outputDir, { recursive: true, force: true });
      }
    },
    15 * 60 * 1000
  );
});
