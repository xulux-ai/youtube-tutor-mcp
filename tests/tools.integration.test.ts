import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RunYtDlp } from "../src/transcript/fetcher.js";
import { TRANSPARENCY_NOTE } from "../src/constants.js";
import { loadVideoHandler } from "../src/tools/loadVideo.js";
import { setPositionHandler } from "../src/tools/setPosition.js";
import { getContextHandler } from "../src/tools/getContext.js";
import { askAtPositionHandler } from "../src/tools/askAtPosition.js";
import { findConceptHandler } from "../src/tools/findConcept.js";
import { getVideoStatusHandler } from "../src/tools/getVideoStatus.js";

const VIDEO_ID = "dQw4w9WgXcQ";

describe("tool handlers (integration)", () => {
  let cacheRoot: string;
  let sessionPath: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yt-tools-cache-"));
    const sessionDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-tools-sess-"));
    sessionPath = path.join(sessionDir, "default.json");
  });

  afterEach(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
    await fs.rm(path.dirname(sessionPath), { recursive: true, force: true });
  });

  async function loadFixtureVideo() {
    const fixturePath = path.join(
      import.meta.dirname,
      "fixtures",
      "sample.en.vtt",
    );
    const vtt = await fs.readFile(fixturePath, "utf8");
    const runYtDlp: RunYtDlp = async (_args, opts) => {
      await fs.writeFile(
        path.join(opts.cwd, `${VIDEO_ID}.en.vtt`),
        vtt,
        "utf8",
      );
      return {
        stdout: "Sample Title\nSample Channel\n212\n",
        stderr: "",
        code: 0,
      };
    };

    return loadVideoHandler({
      url: VIDEO_ID,
      cacheRoot,
      sessionPath,
      runYtDlp,
    });
  }

  it("loads video, sets position, gets context, finds concept, asks, status", async () => {
    const loaded = await loadFixtureVideo();

    expect(loaded.fromCache).toBe(false);
    expect(loaded.transparencyNote).toBe(TRANSPARENCY_NOTE);
    expect(loaded.videoId).toBe(VIDEO_ID);
    expect(loaded.title).toBe("Sample Title");
    expect(loaded.channel).toBe("Sample Channel");
    expect(loaded.language).toBe("en");
    expect(loaded.segmentCount).toBeGreaterThan(0);
    expect(loaded.preview.length).toBeGreaterThan(0);

    const position = await setPositionHandler({
      timestamp: "12:34",
      sessionPath,
    });
    expect(position.positionSec).toBe(754);
    expect(position.videoId).toBe(VIDEO_ID);
    expect(position.positionLabel).toBe("12:34");

    const ctx = await getContextHandler({ cacheRoot, sessionPath });
    expect(ctx.videoId).toBe(VIDEO_ID);
    expect(ctx.positionSec).toBe(754);
    expect(ctx.segments.some((s) => /attention/i.test(s.text))).toBe(true);

    const found = await findConceptHandler({
      query: "attention",
      cacheRoot,
      sessionPath,
    });
    expect(found.videoId).toBe(VIDEO_ID);
    expect(found.query).toBe("attention");
    expect(found.hits.length).toBeGreaterThan(0);
    expect(found.hits[0]?.timestamp).toBeTruthy();
    expect(found.hits[0]?.quote).toMatch(/attention/i);

    const asked = await askAtPositionHandler({
      question: "what is attention?",
      cacheRoot,
      sessionPath,
    });
    expect(asked.question).toBe("what is attention?");
    expect(asked.segments.some((s) => /attention/i.test(s.text))).toBe(true);

    const status = await getVideoStatusHandler({ cacheRoot, sessionPath });
    expect(status.activeVideoId).toBe(VIDEO_ID);
    expect(status.positionSec).toBe(754);
    expect(status.positionLabel).toBe("12:34");
    expect(status.cached).toBe(true);
    expect(status.language).toBe("en");
    expect(status.title).toBe("Sample Title");
    expect(status.segmentCount).toBeGreaterThan(0);
  });

  it("throws when context/search/ask have no active video", async () => {
    await expect(
      getContextHandler({ cacheRoot, sessionPath }),
    ).rejects.toThrow(/No active video/);
    await expect(
      findConceptHandler({ query: "attention", cacheRoot, sessionPath }),
    ).rejects.toThrow(/No active video/);
    await expect(
      askAtPositionHandler({
        question: "what?",
        cacheRoot,
        sessionPath,
      }),
    ).rejects.toThrow(/No active video/);
  });

  it("throws when getContext has no position", async () => {
    await loadFixtureVideo();
    await expect(
      getContextHandler({ cacheRoot, sessionPath }),
    ).rejects.toThrow(/No position set/);
  });

  it("timestamp override does not clear sticky position", async () => {
    await loadFixtureVideo();
    await setPositionHandler({ timestamp: "12:34", sessionPath });

    const overridden = await getContextHandler({
      timestamp: "0:02",
      cacheRoot,
      sessionPath,
    });
    expect(overridden.positionSec).toBe(2);
    expect(overridden.segments.some((s) => /welcome/i.test(s.text))).toBe(true);

    const sticky = await getContextHandler({ cacheRoot, sessionPath });
    expect(sticky.positionSec).toBe(754);
  });
});
