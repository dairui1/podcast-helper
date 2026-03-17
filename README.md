# podcast-helper

[简体中文](./README.zh-CN.md)

`podcast-helper` is a Node-based CLI for podcast download and transcription workflows.

The project currently focuses on one concrete workflow:

- Resolve a podcast episode URL from many major platforms
- Resolve a public podcast episode page that exposes direct audio metadata or a discoverable RSS/Atom feed
- Accept a direct remote audio URL
- Accept a local audio file
- Download the original audio
- Transcribe with ElevenLabs or local `mlx-whisper`
- Generate `audio + SRT + TXT` artifacts

## Status

This project is early but functional.

Current scope:

- Source:
  Xiaoyuzhou, Apple Podcasts, YouTube (via yt-dlp), Spotify (detection + DRM notice),
  Pocket Casts, Castro, Ximalaya, Podcast Addict,
  generic public podcast episode pages,
  direct audio URLs,
  and local audio files
- Transcription backends:
  `elevenlabs`, `openai`, `groq`, `deepgram`, `gladia`, `assemblyai`, `revai`, and local `mlx-whisper` on Apple Silicon
- Outputs: original audio, `.srt`, `.txt`
- Toolchain: `pnpm + biome + vitest + tsup`

Planned next:

- Better subtitle segmentation and transcript cleanup
- Local STT backends
- npm publishing

## Supported Platforms

| Platform | Strategy | Notes |
|----------|----------|-------|
| **Xiaoyuzhou** (小宇宙) | Dedicated adapter | China's top podcast platform |
| **Apple Podcasts** | iTunes Lookup API, RSS fallback | `podcasts.apple.com` episode URLs |
| **YouTube** | `yt-dlp` audio extraction | Requires `yt-dlp` installed |
| **Spotify** | Detection only | DRM-protected; prompts user to find RSS alternative |
| **Pocket Casts** | oEmbed → embed page | `pca.st` share links |
| **Castro** | HTML audio extraction | `castro.fm` episode links |
| **Ximalaya** (喜马拉雅) | Mobile track API | Free tracks on `ximalaya.com` |
| **Podcast Addict** | URL-encoded audio path | `podcastaddict.com` episode links |
| **Generic** | og:audio / RSS / audio tags / JSON-LD | Fallback for any public episode page |

## Requirements

- Node.js 20+
- One provider API key for remote transcription:
  `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `GLADIA_API_KEY`, `ASSEMBLYAI_API_KEY`, or `REVAI_API_KEY`
- `ffmpeg` and `python3` for local Apple Silicon transcription

## Default Engine Selection

`podcast-helper` chooses the transcription engine automatically:

- If local `mlx-whisper` is available, it uses `mlx-whisper` first
- `ELEVENLABS_API_KEY` -> `elevenlabs`
- `OPENAI_API_KEY` -> `openai`
- `GROQ_API_KEY` -> `groq`
- `DEEPGRAM_API_KEY` -> `deepgram`
- `GLADIA_API_KEY` -> `gladia`
- `ASSEMBLYAI_API_KEY` -> `assemblyai`
- `REVAI_API_KEY` -> `revai`
- If local `mlx-whisper` is unavailable and none of the above are set, it falls back to `mlx-whisper` and the local run will fail until `mlx-whisper` is installed

You can always override this with `--engine <provider>`.

## User Quick Start

Run without installing globally:

```bash
npx podcast-helper --help
pnpm dlx podcast-helper --help
```

Inspect the local environment before enabling local transcription:

```bash
npx podcast-helper doctor
```

Transcribe a podcast episode page or audio file:

```bash
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

Generic episode-page support works best for public podcast pages that expose:

- `og:audio` or similar audio metadata
- `<audio>` or `<source>` tags
- JSON-LD `AudioObject` or `PodcastEpisode`
- an alternate RSS or Atom feed that links back to the current episode page

That covers many host-powered public pages without a dedicated adapter, including pages commonly built on Buzzsprout, Libsyn, Simplecast, Podbean, Transistor, Castos, Omny, Acast, and Spreaker.

Force OpenAI explicitly:

```bash
export OPENAI_API_KEY=your_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine openai --output-dir ./out/openai --json
```

Apple Silicon local transcription with `mlx-whisper`:

```bash
npx podcast-helper setup mlx-whisper
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --output-dir ./out/mlx --json
```

The setup command installs `mlx-whisper` into a stable virtual environment under `~/.podcast-helper/venvs/mlx-whisper`, and the CLI will auto-detect it on future runs.

Chunked local transcription with streaming progress:

```bash
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --chunk-duration 300 --progress jsonl --output-dir ./out/mlx --json
```

If you prefer a persistent install:

```bash
npm install -g podcast-helper
podcast-helper --help
```

## Development Requirements

- Node.js 20+
- pnpm 10+

## Development Quick Start

Install dependencies:

```bash
pnpm install
```

Run the CLI from source:

```bash
export ELEVENLABS_API_KEY=your_key
pnpm run dev -- transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/example --json
```

Build the distributable CLI:

```bash
pnpm run build
node dist/cli.js --help
```

## Usage

Transcribe a Xiaoyuzhou episode:

```bash
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

Transcribe a public podcast episode page discovered through generic HTML or feed metadata:

```bash
npx podcast-helper transcribe https://example.fm/episodes/42 --output-dir ./out/episode-page --json
```

Transcribe a direct audio URL with Groq:

```bash
export GROQ_API_KEY=your_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine groq --output-dir ./out/groq --json
```

Transcribe a local audio file with automatic engine selection:

```bash
podcast-helper transcribe ./audio/interview.mp3 --output-dir ./out/local --json
```

Transcribe locally on Apple Silicon with `mlx-whisper`:

```bash
npx podcast-helper setup mlx-whisper
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --output-dir ./out/local-mlx --json
```

Keep the isolated temp workspace for debugging:

```bash
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --keep-temp --output-dir ./out/local-mlx --json
```

Example output:

```json
{
  "ok": true,
  "command": "transcribe",
  "input": "https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2",
  "source": "xiaoyuzhou",
  "episodeId": "69b4d2f9f8b8079bfa3ae7f2",
  "language": "zho",
  "artifacts": {
    "audio": "/abs/path/xiaoyuzhou-69b4d2f9f8b8079bfa3ae7f2.m4a",
    "srt": "/abs/path/xiaoyuzhou-69b4d2f9f8b8079bfa3ae7f2.srt",
    "txt": "/abs/path/xiaoyuzhou-69b4d2f9f8b8079bfa3ae7f2.txt"
  }
}
```

Example failure output on `stderr` when `--json` is enabled:

```json
{
  "ok": false,
  "command": "transcribe",
  "error": {
    "code": "MLX_WHISPER_UNAVAILABLE",
    "category": "dependency",
    "message": "mlx-whisper is not available. Run `podcast-helper doctor` to inspect your environment, then `podcast-helper setup mlx-whisper` to install the local runtime.",
    "hints": [
      "Run `podcast-helper doctor` to inspect the local runtime.",
      "Run `podcast-helper setup mlx-whisper` to install the local runtime."
    ]
  }
}
```

For agent automation, prefer:

- `--json` for a stable success or failure envelope
- `--progress jsonl` for machine-readable progress and terminal error events on `stderr`

## Agent Skill

This repository ships a single agent skill for the full transcript workflow:

- transcribe podcast audio
- generate `audio + SRT + TXT`
- optionally clean the transcript with Jina Reader context

Install the skill into the current project:

```bash
npx skills add dairui1/podcast-helper --skill transcribe
```

Install globally:

```bash
npx skills add dairui1/podcast-helper --skill transcribe -g
```

The skill lives at:

- [skills/transcribe/SKILL.md](./skills/transcribe/SKILL.md)

Distribution:

- `skills.sh` has no separate publish step. This repository is installable with `npx skills add dairui1/podcast-helper --skill transcribe`, and the skill shows up on `skills.sh` after users install it.
- ClawHub supports explicit publishing from the same skill directory. This repository includes [`.github/workflows/publish-skills.yml`](./.github/workflows/publish-skills.yml), which publishes every skill in `./skills` to ClawHub when a GitHub release is published or when the workflow is run manually.
- Configure the repository secret `CLAWHUB_TOKEN` before using the ClawHub workflow.
- Skill metadata versions should stay semver because ClawHub publish expects semver, for example `1.4.0`.

The skill teaches agents to prefer no-install entry points first:

```bash
npx podcast-helper transcribe <input> --output-dir <dir> --json
pnpm dlx podcast-helper transcribe <input> --output-dir <dir> --json
```

When `--engine` is omitted:

- local `mlx-whisper` available: use `mlx-whisper`
- `ELEVENLABS_API_KEY`: use `elevenlabs`
- `OPENAI_API_KEY`: use `openai`
- `GROQ_API_KEY`: use `groq`
- `DEEPGRAM_API_KEY`: use `deepgram`
- `GLADIA_API_KEY`: use `gladia`
- `ASSEMBLYAI_API_KEY`: use `assemblyai`
- `REVAI_API_KEY`: use `revai`
- otherwise: use `mlx-whisper`

For local Apple Silicon runs, the workflow now uses:

- a per-request temp workspace
- FFmpeg chunking with a default chunk size of `300` seconds for `mlx-whisper`
- chunk-by-chunk progress and partial transcript events on `stderr`
- structured error payloads for agents when `--json` or `--progress jsonl` is enabled
- automatic cleanup unless `--keep-temp` is set
- `podcast-helper doctor` to inspect the local runtime
- `podcast-helper setup mlx-whisper` to install the local runtime into a stable venv

For low-cost live verification, the skill recommends:

```bash
https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3
```

After transcription, the same skill tells the agent to ask whether cleanup is needed. If yes, it uses Jina Reader:

```bash
https://r.jina.ai/<podcast-url>
```

It uses the episode page as external context to repair ASR mistakes, especially names, homophones, and noisy filler words, and writes a cleaned sibling transcript instead of overwriting the raw one.

## Development

Run the project checks:

```bash
pnpm run check
```

Run formatting:

```bash
pnpm run format
```

Run live transcription tests:

```bash
export ELEVENLABS_API_KEY=your_key
pnpm run test:live
```

Run the local `mlx-whisper` live test:

```bash
npx podcast-helper setup mlx-whisper
export MLX_WHISPER_PYTHON="$HOME/.podcast-helper/venvs/mlx-whisper/bin/python"
pnpm run test:live
```

## Repository Layout

```text
src/
  cli.ts
  output/
  sources/
  transcribe/
test/
```

## License

[MIT](./LICENSE)
