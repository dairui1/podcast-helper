---
name: transcribe
description: Use podcast-helper to transcribe podcast audio into original audio, SRT subtitles, and TXT transcripts, then optionally clean the transcript with episode-page context. Use when the user asks to transcribe a podcast episode, generate subtitles, extract a transcript from an audio file, or polish a raw transcript using the podcast page. Prefer no-install invocation through npx or pnpm dlx when appropriate.
allowed-tools: Bash(curl:*), Bash(podcast-helper:*), Bash(npx podcast-helper:*), Bash(pnpm dlx podcast-helper:*), Bash(node dist/cli.js:*), Bash(pnpm run build:*)
---

# Transcribe and Clean with podcast-helper

`podcast-helper` is a CLI for podcast download and transcription workflows.

Use this skill when the user wants any of the following:

- Transcribe a Xiaoyuzhou episode URL
- Transcribe a direct remote audio URL
- Transcribe a local audio file
- Generate subtitle files (`.srt`)
- Generate plain transcript files (`.txt`)
- Clean a raw transcript after transcription
- Fix obvious ASR mistakes with episode-page context
- Run local transcription on Apple Silicon

## Inputs

The main `transcribe` command accepts exactly one input:

- A Xiaoyuzhou episode URL
- A direct audio URL such as `.mp3` or `.m4a`
- A local audio file path

Examples:

```bash
podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --output-dir ./out/smoke --json
podcast-helper transcribe ./audio/interview.mp3 --output-dir ./out/local --json
```

## Requirements

- `ELEVENLABS_API_KEY` must be set
- The CLI can be invoked from npm with `npx` or `pnpm dlx`, or run from the repository
- Cleanup with Jina Reader is optional and does not require ElevenLabs

For Apple Silicon local transcription with `mlx-whisper`:

- `ffmpeg` must be installed
- `python3 -m pip install mlx-whisper`

Check the API key first if transcription is expected to run:

```bash
printenv ELEVENLABS_API_KEY
```

## Preferred Command Form

Prefer machine-readable output:

```bash
npx podcast-helper transcribe <input> --output-dir <dir> --json
```

For Apple Silicon local transcription:

```bash
npx podcast-helper transcribe <input> --engine mlx-whisper --output-dir <dir> --json
```

Why:

- Progress goes to `stderr`
- Final artifact paths are emitted as JSON on `stdout`
- Agents can parse the output without scraping logs

## Output Contract

The command produces:

- Original audio file
- `.srt` subtitle file
- `.txt` transcript file

Typical JSON output:

```json
{
  "input": "https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3",
  "source": "remote-audio-url",
  "language": "eng",
  "artifacts": {
    "audio": "/abs/path/nicole.mp3",
    "srt": "/abs/path/nicole.srt",
    "txt": "/abs/path/nicole.txt"
  }
}
```

## Default Workflow

Use this order by default:

1. Transcribe with `podcast-helper`
2. Report the generated artifact paths
3. Ask whether the user also wants cleanup
4. If yes, fetch episode-page context through Jina Reader and produce a cleaned sibling transcript

Suggested follow-up question:

```text
Do you want me to clean the transcript as well?
```

When cleanup is requested, keep the raw transcript unchanged and write a sibling file:

- Raw: `episode.txt`
- Cleaned: `episode.cleaned.txt`

## Execution Strategy

Use this order of preference:

1. `npx podcast-helper transcribe ...`
2. `pnpm dlx podcast-helper transcribe ...`
3. `podcast-helper transcribe ...`
4. In this repository: `node dist/cli.js transcribe ...`

If the user explicitly wants local transcription on Apple Silicon, prefer `--engine mlx-whisper`.

Do not default to repository build instructions unless you are already working inside this repository.

If you are inside the repository and `dist/cli.js` is missing, build first:

```bash
pnpm run build
```

Then run:

```bash
node dist/cli.js transcribe <input> --output-dir <dir> --json
```

## Agent Guidance

- Prefer a small public audio file for smoke tests to reduce transcription cost.
- Use `https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3` for a cheap live verification unless the user explicitly wants a real podcast episode.
- Use a dedicated output directory per task.
- Report the generated artifact paths back to the user.
- Prefer `npx` or `pnpm dlx` when the user does not already have the CLI installed.
- If the user wants local or offline transcription on Apple Silicon, switch to `--engine mlx-whisper`.
- If the input is a Xiaoyuzhou episode, the CLI resolves and downloads the source audio automatically.
- After transcription, if the user appears to want a polished transcript, ask whether they also want cleanup.

## Cleanup Workflow

Use this branch when:

- The user says yes to cleanup after transcription
- The user already has a raw `.txt` transcript and wants it polished

Recommended inputs:

- The original podcast URL
- The raw transcript file, usually `.txt`

Optional but useful:

- The `.srt` file
- The original audio file

Fetch the episode page through Jina Reader:

```bash
curl https://r.jina.ai/<podcast-url>
```

For example:

```bash
curl https://r.jina.ai/https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2
```

Use the page content as reference context to:

- Fix obvious homophone and ASR mistakes
- Recover names, products, titles, and other proper nouns
- Remove repeated filler words and disfluencies when they are clearly redundant
- Normalize punctuation and paragraph breaks for readability

Apply conservative cleanup:

- Preserve speaker intent and factual content
- Do not invent missing material
- Do not summarize instead of cleaning
- Do not overwrite the raw transcript

If the episode URL is unavailable, clean conservatively using transcript-only evidence and state that no external episode context was used.

## Failure Modes

If transcription fails:

- Verify `ELEVENLABS_API_KEY` is present
- Verify the input URL is reachable
- Re-run with a fresh output directory
- If using the repository build, run `pnpm run check` and `pnpm run build`

If cleanup quality is uncertain:

- Verify the podcast URL matches the transcript
- Re-fetch the Jina Reader page and inspect whether it contains useful episode metadata
- Prefer fewer edits when the page does not provide enough grounding

## Install This Skill

Project-local install:

```bash
npx skills add dairui1/podcast-helper --skill transcribe
```

Global install:

```bash
npx skills add dairui1/podcast-helper --skill transcribe -g
```
