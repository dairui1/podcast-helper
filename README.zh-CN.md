# podcast-helper

[English](./README.md)

`podcast-helper` 是一个面向播客下载和转录流程的 Node CLI 工具。

当前项目先聚焦一个明确可用的场景：

- 解析多个主流播客平台的单集链接
- 解析公开播客单集页面，只要页面暴露了直接音频元数据或可发现的 RSS/Atom feed
- 接受直接音频 URL
- 接受本地音频文件
- 下载原始音频
- 使用 ElevenLabs 或本地 `mlx-whisper` 进行转录
- 产出 `音频 + SRT + TXT`

## 当前状态

项目目前还处在早期阶段，但核心链路已经可用。

当前支持：

- 来源：小宇宙、Apple Podcasts、YouTube（通过 yt-dlp）、Spotify（检测 + DRM 提示）、Pocket Casts、Castro、喜马拉雅、Podcast Addict、通用公开播客单集页面、直接音频 URL、本地音频文件
- 转录后端：
  `elevenlabs`、`openai`、`groq`、`deepgram`、`gladia`、`assemblyai`、`revai`，以及 Apple Silicon 上的本地 `mlx-whisper`
- 输出：原始音频、`.srt`、`.txt`
- 工具链：`pnpm + biome + vitest + tsup`

接下来计划：

- 优化字幕分段和文本清洗
- 增加本地 STT 后端
- 发布 npm 包

## 支持的平台

| 平台 | 策略 | 说明 |
|------|------|------|
| **小宇宙** | 专用适配器 | 中文播客最热门平台 |
| **Apple Podcasts** | iTunes Lookup API + RSS 兜底 | `podcasts.apple.com` 单集链接 |
| **YouTube** | `yt-dlp` 提取音频 | 需要安装 `yt-dlp` |
| **Spotify** | 仅检测 | DRM 保护，提示用户找 RSS 替代 |
| **Pocket Casts** | oEmbed → embed 页面 | `pca.st` 分享链接 |
| **Castro** | HTML 音频提取 | `castro.fm` 单集链接 |
| **喜马拉雅** | 移动端音轨 API | `ximalaya.com` 免费音轨 |
| **Podcast Addict** | URL 编码音频路径 | `podcastaddict.com` 单集链接 |
| **通用** | og:audio / RSS / audio 标签 / JSON-LD | 任何公开单集页面的兜底方案 |

## 环境要求

- Node.js 20+
- 如果使用远程转录，需要至少一个 provider key：
  `ELEVENLABS_API_KEY`、`OPENAI_API_KEY`、`GROQ_API_KEY`、`DEEPGRAM_API_KEY`、`GLADIA_API_KEY`、`ASSEMBLYAI_API_KEY`、`REVAI_API_KEY`
- 如果使用本地 Apple Silicon 转录，需要 `ffmpeg` 和 `python3`

## 默认引擎选择

`podcast-helper` 会自动选择转录引擎：

- 如果本地 `mlx-whisper` 可用，优先走 `mlx-whisper`
- `ELEVENLABS_API_KEY` -> `elevenlabs`
- `OPENAI_API_KEY` -> `openai`
- `GROQ_API_KEY` -> `groq`
- `DEEPGRAM_API_KEY` -> `deepgram`
- `GLADIA_API_KEY` -> `gladia`
- `ASSEMBLYAI_API_KEY` -> `assemblyai`
- `REVAI_API_KEY` -> `revai`
- 如果本地 `mlx-whisper` 不可用且以上都没有，就会回退到 `mlx-whisper`，此时需要先安装本地依赖才能成功运行

如果需要，也可以显式传 `--engine <provider>` 覆盖默认行为。

## 用户快速开始

不做全局安装，直接运行：

```bash
npx podcast-helper --help
pnpm dlx podcast-helper --help
```

如果要先检查本地环境：

```bash
npx podcast-helper doctor
```

转录播客单集页面或音频文件：

```bash
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

通用单集页面支持最适合这类公开页面：

- 页面里有 `og:audio` 之类的音频元数据
- 页面里有 `<audio>` 或 `<source>` 标签
- 页面里有 JSON-LD `AudioObject` 或 `PodcastEpisode`
- 页面里有一个能回指当前单集页的 RSS / Atom feed

这意味着很多常见 host 的公开单集页都不需要专门 adapter 就能工作，比如基于 Buzzsprout、Libsyn、Simplecast、Podbean、Transistor、Castos、Omny、Acast、Spreaker 搭建的页面。

显式使用 OpenAI 做转录：

```bash
export OPENAI_API_KEY=你的_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine openai --output-dir ./out/openai --json
```

Apple Silicon 本地转录，使用 `mlx-whisper`：

```bash
npx podcast-helper setup mlx-whisper
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --output-dir ./out/mlx --json
```

`setup` 会把 `mlx-whisper` 安装到稳定的虚拟环境 `~/.podcast-helper/venvs/mlx-whisper` 下，后续 CLI 会自动发现并优先使用它。

本地分块转录，并输出流式进度：

```bash
npx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine mlx-whisper --chunk-duration 300 --progress jsonl --output-dir ./out/mlx --json
```

如果希望长期可用，也可以全局安装：

```bash
npm install -g podcast-helper
podcast-helper --help
```

## 开发环境要求

- Node.js 20+
- pnpm 10+

## 开发快速开始

安装依赖：

```bash
pnpm install
```

直接从源码运行：

```bash
export ELEVENLABS_API_KEY=你的_key
pnpm run dev -- transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/example --json
```

构建可分发 CLI：

```bash
pnpm run build
node dist/cli.js --help
```

## 使用示例

转录一个小宇宙单集：

```bash
npx podcast-helper transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

转录一个通过通用 HTML 或 feed 元数据发现音频的公开播客单集页面：

```bash
npx podcast-helper transcribe https://example.fm/episodes/42 --output-dir ./out/episode-page --json
```

显式用 Groq 转录一个直接音频 URL：

```bash
export GROQ_API_KEY=你的_key
pnpm dlx podcast-helper transcribe https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3 --engine groq --output-dir ./out/groq --json
```

按默认引擎选择转录一个本地音频文件：

```bash
podcast-helper transcribe ./audio/interview.mp3 --output-dir ./out/local --json
```

在 Apple Silicon 上使用 `mlx-whisper` 做本地转录：

```bash
npx podcast-helper setup mlx-whisper
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --output-dir ./out/local-mlx --json
```

如果要保留独立的临时工作目录用于调试：

```bash
podcast-helper transcribe ./audio/interview.mp3 --engine mlx-whisper --keep-temp --output-dir ./out/local-mlx --json
```

示例输出：

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

开启 `--json` 时，失败会在 `stderr` 输出结构化错误：

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

如果是 agent 自动化场景，推荐：

- 用 `--json` 获取稳定的成功/失败包体
- 用 `--progress jsonl` 获取 `stderr` 上的机器可读进度和最终错误事件

## Agent Skill

这个仓库现在提供一个完整的 agent skill，覆盖整条 transcript 工作流：

- 转录播客音频
- 生成 `音频 + SRT + TXT`
- 在需要时结合 Jina Reader 做 transcript 清洗

安装 skill：

```bash
npx skills add dairui1/podcast-helper --skill transcribe
```

全局安装：

```bash
npx skills add dairui1/podcast-helper --skill transcribe -g
```

skill 文件在：

- [skills/transcribe/SKILL.md](./skills/transcribe/SKILL.md)

这个 skill 会引导 agent 优先使用免安装入口：

```bash
npx podcast-helper transcribe <input> --output-dir <dir> --json
pnpm dlx podcast-helper transcribe <input> --output-dir <dir> --json
```

如果省略 `--engine`：

- 本地 `mlx-whisper` 可用时优先走 `mlx-whisper`
- `ELEVENLABS_API_KEY` 时走 `elevenlabs`
- `OPENAI_API_KEY` 时走 `openai`
- `GROQ_API_KEY` 时走 `groq`
- `DEEPGRAM_API_KEY` 时走 `deepgram`
- `GLADIA_API_KEY` 时走 `gladia`
- `ASSEMBLYAI_API_KEY` 时走 `assemblyai`
- `REVAI_API_KEY` 时走 `revai`
- 其他情况走 `mlx-whisper`

对于本地 Apple Silicon 转录，这条工作流现在默认包含：

- 每次请求一个独立的临时目录
- `mlx-whisper` 默认按 `300` 秒分块
- `stderr` 持续输出 chunk 级别进度和 partial transcript
- 开启 `--json` 或 `--progress jsonl` 时会输出结构化错误信息，便于 agent 处理
- 完成后自动清理，除非显式传 `--keep-temp`
- `podcast-helper doctor` 用来检查本地环境
- `podcast-helper setup mlx-whisper` 用来安装本地运行时

如果只是做低成本真实验证，skill 里推荐优先使用：

```bash
https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3
```

在转录完成后，同一个 skill 会引导 agent 询问用户是否还要清洗 transcript。如果用户同意，就会通过 Jina Reader：

```bash
https://r.jina.ai/<播客url>
```

抓取节目页面内容作为外部上下文，帮助修正常见的同音错别字、专有名词识别错误，以及冗余语气词，并生成一个并列的 cleaned transcript 文件，不覆盖原始文本。

## 开发

运行项目检查：

```bash
pnpm run check
```

运行格式化：

```bash
pnpm run format
```

运行真实转录测试：

```bash
export ELEVENLABS_API_KEY=你的_key
pnpm run test:live
```

运行本地 `mlx-whisper` live test：

```bash
npx podcast-helper setup mlx-whisper
export MLX_WHISPER_PYTHON="$HOME/.podcast-helper/venvs/mlx-whisper/bin/python"
pnpm run test:live
```

## 仓库结构

```text
src/
  cli.ts
  output/
  sources/
  transcribe/
test/
```

## 许可证

[MIT](./LICENSE)
