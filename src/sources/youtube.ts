import type { ResolvedEpisode, SourceAdapter } from "./base";
import { execFile } from "node:child_process";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const YOUTUBE_PATTERNS = [
  /^(?:www\.)?youtube\.com$/i,
  /^youtu\.be$/i,
  /^music\.youtube\.com$/i,
];

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeUrl(input: string): { videoId: string } | undefined {
  try {
    const url = new URL(input);
    if (!YOUTUBE_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      return undefined;
    }

    if (url.hostname === "youtu.be") {
      const videoId = url.pathname.slice(1).split("/")[0];
      return videoId && VIDEO_ID_PATTERN.test(videoId) ? { videoId } : undefined;
    }

    const videoId = url.searchParams.get("v");
    if (videoId && VIDEO_ID_PATTERN.test(videoId)) {
      return { videoId };
    }

    return undefined;
  } catch {
    return undefined;
  }
}

export function extractYouTubeTitle(json: string): string | undefined {
  try {
    const data = JSON.parse(json) as Record<string, unknown>;
    if (typeof data.title === "string") {
      return data.title;
    }
  } catch {}
  return undefined;
}

export function createYouTubeSourceAdapter(
  _fetchImpl: FetchLike = fetch,
  execFileImpl: typeof execFile = execFile
): SourceAdapter {
  return {
    canResolve(input: string) {
      return parseYouTubeUrl(input) !== undefined;
    },

    async resolve(input: string) {
      const parsed = parseYouTubeUrl(input);
      if (!parsed) {
        throw new Error("Not a YouTube URL.");
      }

      const audioUrl = await extractAudioWithYtDlp(input, execFileImpl);
      const title = await extractTitleWithYtDlp(input, execFileImpl).catch(() => undefined);

      return {
        source: "youtube",
        canonicalUrl: `https://www.youtube.com/watch?v=${parsed.videoId}`,
        episodeId: parsed.videoId,
        title,
        audioUrl,
        suggestedBaseName: `youtube-${parsed.videoId}`,
      };
    },
  };
}

function extractAudioWithYtDlp(
  url: string,
  execFileImpl: typeof execFile
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFileImpl(
      "yt-dlp",
      ["-f", "bestaudio", "--get-url", "--no-playlist", url],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `yt-dlp failed: ${error.message}. ` +
              "Ensure yt-dlp is installed (brew install yt-dlp). " +
              (stderr ? `stderr: ${stderr.toString().trim()}` : "")
            )
          );
          return;
        }

        const audioUrl = stdout.toString().trim().split("\n")[0];
        if (!audioUrl) {
          reject(new Error("yt-dlp returned no audio URL."));
          return;
        }

        resolve(audioUrl);
      }
    );
  });
}

function extractTitleWithYtDlp(
  url: string,
  execFileImpl: typeof execFile
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    execFileImpl(
      "yt-dlp",
      ["--print", "title", "--no-playlist", url],
      { timeout: 15_000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.toString().trim() || undefined);
      }
    );
  });
}
