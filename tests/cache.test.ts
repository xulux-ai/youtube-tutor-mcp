import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveTranscript, loadTranscript, transcriptExists } from "../src/cache.js";
import type { TranscriptDoc } from "../src/types.js";

describe("cache", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "yt-tutor-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("round-trips a transcript", async () => {
    const doc: TranscriptDoc = {
      videoId: "dQw4w9WgXcQ",
      title: "Sample",
      channel: "Test",
      source: "youtube-captions",
      language: "en",
      fetchedAt: "2026-07-26T00:00:00.000Z",
      segments: [{ start: 0, duration: 2, text: "hello" }],
    };
    const savedPath = await saveTranscript(doc, root);
    expect(savedPath).toContain("dQw4w9WgXcQ.json");
    expect(await transcriptExists("dQw4w9WgXcQ", root)).toBe(true);
    const loaded = await loadTranscript("dQw4w9WgXcQ", root);
    expect(loaded).toEqual(doc);
  });

  it("returns null for missing transcript", async () => {
    expect(await loadTranscript("missing_____", root)).toBeNull();
  });
});
