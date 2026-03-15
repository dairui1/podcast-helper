# podcast-helper

[简体中文](./README.zh-CN.md)

`podcast-helper` is a Node-based CLI for podcast download and transcription workflows.

The project currently focuses on one concrete workflow:

- Resolve a Xiaoyuzhou episode URL
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
  Xiaoyuzhou episode URLs,
  generic public podcast episode pages,
  direct audio URLs,
  and local audio files
- Transcription backends:
  `elevenlabs`, `openai`, `groq`, `deepgram`, `gladia`, `assemblyai`, `revai`, and local `mlx-whisper` on Apple Silicon
- Outputs: original audio, `.srt`, `.txt`
- Toolchain: `pnpm + biome + vitest + tsup`

Planned next:

- More podcast source adapters
- Better subtitle segmentation and transcript cleanup
- Local STT backends
- npm publishing

## Requirements

- Node.js 20+
- One provider API key for remote transcription:
  `ELEVENLABS_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY`, `GLADIA_API_KEY`, `ASSEMBLYAI_API_KEY`, or `REVAI_API_KEY`
- `ffmpeg` and `python3 -m pip install mlx-whisper` for local Apple Silicon transcription

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
brew install ffmpeg
python3 -m pip install mlx-whisper
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --output-dir ./out/mlx --json
```

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
python3 -m pip install mlx-whisper
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --output-dir ./out/local-mlx --json
```

Keep the isolated temp workspace for debugging:

```bash
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --keep-temp --output-dir ./out/local-mlx --json
```

Example output:

```json
{
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
- automatic cleanup unless `--keep-temp` is set

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
export MLX_WHISPER_PYTHON="$(which python3)"
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
