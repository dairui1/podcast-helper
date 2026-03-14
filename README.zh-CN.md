# podcast-helper

[English](./README.md)

`podcast-helper` 是一个面向播客下载和转录流程的 Node CLI 工具。

当前项目先聚焦一个明确可用的场景：

- 解析小宇宙单集链接
- 下载原始音频
- 使用 ElevenLabs 进行转录
- 产出 `音频 + SRT + TXT`

## 当前状态

项目目前还处在早期阶段，但核心链路已经可用。

当前支持：

- 来源：小宇宙单集链接
- 转录后端：ElevenLabs Speech to Text
- 输出：原始音频、`.srt`、`.txt`
- 工具链：`pnpm + biome + vitest + tsup`

接下来计划：

- 支持更多播客站点
- 优化字幕分段和文本清洗
- 增加本地 STT 后端
- 发布 npm 包

## 环境要求

- Node.js 20+
- pnpm 10+
- 可用的 `ELEVENLABS_API_KEY`

## 快速开始

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
export ELEVENLABS_API_KEY=你的_key
node dist/cli.js transcribe https://www.xiaoyuzhoufm.com/episode/69b4d2f9f8b8079bfa3ae7f2 --output-dir ./out/episode --json
```

示例输出：

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

这个 skill 会引导 agent 优先使用：

```bash
podcast-helper transcribe <input> --output-dir <dir> --json
```

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
