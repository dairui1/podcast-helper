import { describe, expect, test } from "vitest";

import { parseYouTubeUrl } from "../src/sources/youtube";

describe("youtube source resolver", () => {
  test("parses standard YouTube watch URL", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("parses youtu.be short URL", () => {
    expect(parseYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("parses YouTube Music URL", () => {
    expect(parseYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      videoId: "dQw4w9WgXcQ",
    });
  });

  test("rejects non-YouTube URLs", () => {
    expect(parseYouTubeUrl("https://example.com/watch?v=abc")).toBeUndefined();
    expect(parseYouTubeUrl("https://www.youtube.com/playlist?list=PLxxx")).toBeUndefined();
    expect(parseYouTubeUrl("not-a-url")).toBeUndefined();
  });

  test("rejects invalid video IDs", () => {
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=short")).toBeUndefined();
    expect(parseYouTubeUrl("https://www.youtube.com/watch?v=toolongvideoidhere")).toBeUndefined();
  });
});
