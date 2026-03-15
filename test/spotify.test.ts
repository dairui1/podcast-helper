import { describe, expect, test } from "vitest";

import { createSpotifySourceAdapter } from "../src/sources/spotify";

describe("spotify source resolver", () => {
  test("recognizes Spotify episode URLs", () => {
    const adapter = createSpotifySourceAdapter();
    expect(adapter.canResolve("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk")).toBe(
      true
    );
  });

  test("rejects non-Spotify URLs", () => {
    const adapter = createSpotifySourceAdapter();
    expect(adapter.canResolve("https://example.com/episode/123")).toBe(false);
    expect(adapter.canResolve("https://open.spotify.com/track/abc")).toBe(false);
  });

  test("throws DRM error on resolve", async () => {
    const adapter = createSpotifySourceAdapter();
    await expect(
      adapter.resolve("https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk")
    ).rejects.toThrow("DRM-protected");
  });
});
