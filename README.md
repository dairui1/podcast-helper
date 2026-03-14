# podcast-helper

[简体中文](./README.zh-CN.md)

`podcast-helper` is a Node-based CLI for podcast download and transcription workflows.

The project currently focuses on one concrete workflow:

- Resolve a Xiaoyuzhou episode URL
- Accept a direct remote audio URL
- Accept a local audio file
- Download the original audio
- Transcribe with ElevenLabs
- Generate `audio + SRT + TXT` artifacts

## Status

This project is early but functional.

Current scope:

- Source: Xiaoyuzhou episode URLs, direct audio URLs, local audio files
- Transcription backend: ElevenLabs Speech to Text
- Outputs: original audio, `.srt`, `.txt`
- Toolchain: `pnpm + biome + vitest + tsup`

Planned next:

- More podcast source adapters
- Better subtitle segmentation and transcript cleanup
- Local STT backends
- npm publishing

## Requirements

- Node.js 20+
- An `ELEVENLABS_API_KEY`

## User Quick Start

Run without installing globally:

```bash
npx podcast-helper --help
pnpm dlx podcast-helper --help
```

Transcribe a podcast episode or audio file:

```bash
export ELEVENLABS_API_KEY=your_key
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

Low-cost smoke test:

```bash
export ELEVENLABS_API_KEY=your_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --output-dir ./out/smoke --json
```

Apple Silicon local transcription with `mlx-whisper`:

```bash
brew install ffmpeg
python3 -m pip install mlx-whisper
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --output-dir ./out/mlx --json
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
export ELEVENLABS_API_KEY=your_key
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

Transcribe a direct audio URL:

```bash
export ELEVENLABS_API_KEY=your_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --output-dir ./out/smoke --json
```

Transcribe a local audio file:

```bash
export ELEVENLABS_API_KEY=your_key
podcast-helper transcribe ./audio/interview.mp3 --output-dir ./out/local --json
```

Transcribe locally on Apple Silicon with `mlx-whisper`:

```bash
python3 -m pip install mlx-whisper
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --output-dir ./out/local-mlx --json
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
