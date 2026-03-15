---
name: transcribe
description: "Use podcast-helper to transcribe podcast audio into original audio, SRT subtitles, and TXT transcripts, then optionally clean the transcript with episode-page context. Use when the user asks to transcribe a podcast episode, generate subtitles, extract a transcript from an audio file, or polish a raw transcript using the podcast page. Prefer no-install invocation through npx or pnpm dlx when appropriate."
allowed-tools: Bash(curl:*), Bash(podcast-helper:*), Bash(npx podcast-helper:*), Bash(pnpm dlx podcast-helper:*), Bash(node dist/cli.js:*), Bash(pnpm run build:*)
metadata:
  version: "1.1"
  tags: [podcast, transcription, audio, subtitles, asr, cleanup]
---

# Transcribe and Clean with podcast-helper

`podcast-helper` is a CLI for podcast download and transcription workflows.

## Quick Reference

| Input Type | Example | Strategy |
|------------|---------|----------|
| Xiaoyuzhou URL | `https://www.xiaoyuzhoufm.com/episode/...` | Auto-resolves audio, transcribe directly |
| Apple Podcasts URL | `https://podcasts.apple.com/us/podcast/.../id...?i=...` | iTunes Lookup API → audio URL |
| YouTube URL | `https://www.youtube.com/watch?v=...` | Extracts audio via yt-dlp |
| Spotify URL | `https://open.spotify.com/episode/...` | DRM-protected; prompts for RSS alternative |
| Pocket Casts URL | `https://pca.st/episode/...` | oEmbed → embed page → audio |
| Castro URL | `https://castro.fm/episode/...` | HTML audio extraction |
| Ximalaya URL | `https://www.ximalaya.com/sound/...` | Mobile track API |
| Podcast Addict URL | `https://podcastaddict.com/episode/...` | Decodes audio URL from path |
| Podcast page URL | `https://example.fm/episodes/42` | Discovers audio via og:audio / RSS / audio tags |
| Direct audio URL | `https://.../file.mp3` | Download and transcribe |
| Local audio file | `./audio/interview.mp3` | Transcribe directly |
| Smoke test | ElevenLabs public sample URL | For quick verification |

| Situation | Action |
|-----------|--------|
| Transcription requested | Run `transcribe` with `--json` flag |
| Cleanup requested | Fetch page via Jina Reader, produce `.cleaned.txt` sibling |
| Engine selection | Let CLI auto-detect unless user specifies |
| Transcription fails | Check API key → run `doctor` → verify URL → retry |
| Local/offline needed | Use `--engine mlx-whisper` on Apple Silicon |

## Detection Triggers

Activate this skill when the user:

- Mentions transcribing audio or podcast episodes
- Asks for subtitles (`.srt`) or transcripts (`.txt`)
- Provides a podcast URL (Xiaoyuzhou, Apple Podcasts, YouTube, Pocket Casts, Castro, Ximalaya, Podcast Addict, or any podcast host)
- Wants to clean or polish a raw ASR transcript
- Asks about podcast-helper CLI usage
- Needs local or offline transcription on Apple Silicon

## Inputs

The main `transcribe` command accepts exactly one input:

- A Xiaoyuzhou episode URL
- An Apple Podcasts episode URL
- A YouTube video URL (requires `yt-dlp`)
- A Pocket Casts, Castro, Ximalaya, or Podcast Addict episode URL
- A public podcast episode page URL
- A direct audio URL such as `.mp3` or `.m4a`
- A local audio file path

Spotify URLs are detected but rejected with a DRM notice.

Examples:

```bash
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
npx podcast-helper transcribe https://example.fm/episodes/42 --output-dir ./out/episode-page --json
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --output-dir ./out/smoke --json
npx podcast-helper transcribe ./audio/interview.mp3 --output-dir ./out/local --json
```

Generic episode-page support works best when the page exposes:

- `og:audio` or similar audio metadata
- `<audio>` or `<source>` tags
- JSON-LD `AudioObject` or `PodcastEpisode`
- an alternate RSS or Atom feed that links back to the current episode page

That covers many host-powered public pages without a dedicated adapter, including pages commonly built on Buzzsprout, Libsyn, Simplecast, Podbean, Transistor, Castos, Omny, Acast, and Spreaker.

## Requirements & Engine Selection

### Environment Variables

| Provider | Env Variable | Engine Flag |
|----------|-------------|-------------|
| Local (Apple Silicon) | — | `mlx-whisper` |
| ElevenLabs | `ELEVENLABS_API_KEY` | `elevenlabs` |
| OpenAI | `OPENAI_API_KEY` | `openai` |
| Groq | `GROQ_API_KEY` | `groq` |
| Deepgram | `DEEPGRAM_API_KEY` | `deepgram` |
| Gladia | `GLADIA_API_KEY` | `gladia` |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | `assemblyai` |
| Rev.ai | `REVAI_API_KEY` | `revai` |

### Auto-Detection Priority

The CLI selects engines in this order (first available wins):

1. Local `mlx-whisper` (if installed)
2. ElevenLabs → OpenAI → Groq → Deepgram → Gladia → AssemblyAI → Rev.ai (by API key presence)
3. Fallback to `mlx-whisper`

Use `--engine <provider>` only when you need to force a specific backend.

### Local Transcription Prerequisites

For Apple Silicon local transcription with `mlx-whisper`:

- `ffmpeg` must be installed
- `python3` must be available
- `podcast-helper setup mlx-whisper` installs the local runtime into a stable venv

Quick check:

```bash
printenv ELEVENLABS_API_KEY  # or whichever key you expect
```

## Preferred Command Form

Always prefer machine-readable output:

```bash
npx podcast-helper transcribe <input> --output-dir <dir> --json
```

The local workflow defaults to:

- a request-scoped temp workspace
- FFmpeg chunking at `300` seconds
- chunk-by-chunk partial transcript events on `stderr`
- automatic cleanup unless `--keep-temp` is set

Why:

- Progress goes to `stderr`
- Final success payloads are emitted as JSON on `stdout`
- Structured failure payloads are emitted as JSON on `stderr`
- Agents can parse the output without scraping logs

## Output Contract

The command produces:

- Original audio file
- `.srt` subtitle file
- `.txt` transcript file

### Success Response

```json
{
  "ok": true,
  "command": "transcribe",
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

### Failure Response (stderr)

```json
{
  "ok": false,
  "command": "transcribe",
  "error": {
    "code": "SOURCE_RESOLUTION_FAILED",
    "category": "source",
    "message": "Could not extract podcast audio from the provided page.",
    "hints": [
      "Pass the original episode page URL, a direct audio URL, or a local audio file.",
      "If this site hides audio metadata, download the audio separately and rerun `transcribe` with the file path."
    ]
  }
}
```

If you need machine-readable progress and terminal failures on the same stream, use `--progress jsonl`.

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

## Execution Strategy

| Priority | Method | When to Use |
|----------|--------|-------------|
| 1 | `npx podcast-helper transcribe ...` | Default for most users |
| 2 | `pnpm dlx podcast-helper transcribe ...` | pnpm environments |
| 3 | `podcast-helper transcribe ...` | Already installed globally |
| 4 | `node dist/cli.js transcribe ...` | Inside this repository only |

If the user explicitly wants local transcription on Apple Silicon, prefer `--engine mlx-whisper`.
If the user explicitly wants a specific hosted backend, prefer `--engine <provider>`.
Otherwise let the CLI choose based on the available provider API keys.

Do not default to repository build instructions unless you are already working inside this repository.

If you are inside the repository and `dist/cli.js` is missing, build first:

```bash
pnpm run build
```

Then run:

```bash
node dist/cli.js transcribe <input> --output-dir <dir> --json
```

## Cleanup Workflow

Use this branch when:

- The user says yes to cleanup after transcription
- The user already has a raw `.txt` transcript and wants it polished

### Inputs

| Required | Optional |
|----------|----------|
| Original podcast URL | `.srt` file |
| Raw transcript `.txt` | Original audio file |

### Steps

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

### Cleanup Rules

| Do | Don't |
|----|-------|
| Fix obvious ASR errors | Invent missing material |
| Recover proper nouns from page context | Summarize instead of cleaning |
| Remove redundant fillers | Overwrite the raw transcript |
| Normalize punctuation and paragraphs | Change speaker intent or factual content |

When cleanup is requested, keep the raw transcript unchanged and write a sibling file:

- Raw: `episode.txt`
- Cleaned: `episode.cleaned.txt`

If the episode URL is unavailable, clean conservatively using transcript-only evidence and state that no external episode context was used.

## Failure Modes

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| Transcription fails (hosted) | Wrong or missing API key | Verify matching env var is set |
| Transcription fails (local) | `mlx-whisper` not installed | Run `podcast-helper doctor` then `podcast-helper setup mlx-whisper` |
| Source resolution fails | URL unreachable or audio hidden | Verify URL; download audio manually and pass file path |
| Build missing (`dist/cli.js`) | Repository not built | Run `pnpm run check && pnpm run build` |
| Cleanup quality poor | Page context insufficient | Re-fetch Jina Reader page; prefer fewer edits if lacking context |

## Agent Best Practices

1. **Use cheap audio for smoke tests** — `https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3`
2. **Dedicated output dirs** — one per task to avoid file conflicts
3. **Report artifacts** — always tell the user the generated file paths
4. **Prefer npx/pnpm dlx** — when the CLI is not already installed
5. **Check env first** — verify API keys before attempting hosted transcription
6. **Let CLI auto-detect** — only force `--engine` when the user asks for a specific backend
7. **Ask before cleanup** — don't assume the user wants transcript polishing
8. **Conservative cleanup** — preserve speaker intent; fewer edits are better than hallucinated fixes

## Install This Skill

Project-local install:

```bash
npx skills add dairui1/podcast-helper --skill transcribe
```

Global install:

```bash
npx skills add dairui1/podcast-helper --skill transcribe -g
```
