import { describe, it, expect } from "vitest";
import { fetchAndCacheTranscript } from "../src/transcript/fetcher.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const live = process.env.LIVE_YOUTUBE === "1";

describe.skipIf(!live)("live yt-dlp", () => {
  it("fetches captions for a stable public video", async () => {
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yt-live-"));
    // Short Creative Commons / known-captioned video — replace ID if flaky
    const { doc, fromCache } = await fetchAndCacheTranscript({
      input: "jNQXAC9IVRw", // "Me at the zoo" — has captions; swap if needed
      cacheRoot,
    });
    expect(fromCache).toBe(false);
    expect(doc.segments.length).toBeGreaterThan(0);
    expect(doc.segments[0].text.length).toBeGreaterThan(0);
  }, 120_000);
});
