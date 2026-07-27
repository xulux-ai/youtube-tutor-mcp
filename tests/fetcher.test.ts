import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchAndCacheTranscript, type RunYtDlp } from "../src/transcript/fetcher.js";
import { TRANSPARENCY_NOTE } from "../src/constants.js";

describe("fetchAndCacheTranscript", () => {
  let cacheRoot: string;
  let workDir: string;

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yt-fetcher-cache-"));
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-fetcher-work-"));
  });

  afterEach(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it("fetches via injected runner, caches, and returns transparency note", async () => {
    const fixturePath = path.join(
      import.meta.dirname,
      "fixtures",
      "sample.en.vtt",
    );
    const vtt = await fs.readFile(fixturePath, "utf8");

    let capturedArgs: string[] | undefined;
    const runYtDlp: RunYtDlp = async (args) => {
      capturedArgs = args;
      await fs.writeFile(path.join(workDir, "dQw4w9WgXcQ.en.vtt"), vtt, "utf8");
      return {
        stdout: "Sample Title\nSample Channel\n212\n",
        stderr: "",
        code: 0,
      };
    };

    const first = await fetchAndCacheTranscript({
      input: "dQw4w9WgXcQ",
      cacheRoot,
      workDir,
      runYtDlp,
    });

    expect(capturedArgs).toContain("--skip-download");
    expect(first.fromCache).toBe(false);
    expect(first.doc.segments.length).toBeGreaterThan(0);
    expect(first.doc.source).toBe("youtube-captions");
    expect(first.doc.title).toBe("Sample Title");
    expect(first.doc.channel).toBe("Sample Channel");
    expect(first.doc.durationSec).toBe(212);
    expect(first.transparencyNote).toBe(TRANSPARENCY_NOTE);

    const second = await fetchAndCacheTranscript({
      input: "dQw4w9WgXcQ",
      cacheRoot,
      workDir,
      runYtDlp,
    });

    expect(second.fromCache).toBe(true);
    expect(second.doc.segments.length).toBeGreaterThan(0);
    expect(second.transparencyNote).toBe(TRANSPARENCY_NOTE);
  });

  it("throws No captions available when runner fails with missing subs", async () => {
    const runYtDlp: RunYtDlp = async () => ({
      stdout: "",
      stderr: "WARNING: There are no subtitles for the requested languages",
      code: 1,
    });

    await expect(
      fetchAndCacheTranscript({
        input: "dQw4w9WgXcQ",
        cacheRoot,
        workDir,
        runYtDlp,
      }),
    ).rejects.toThrow(/No captions/);
  });

  it("surfaces yt-dlp install guidance when runner rejects with ENOENT message", async () => {
    const runYtDlp: RunYtDlp = async () => {
      throw new Error(
        "yt-dlp is not installed. Install yt-dlp and ensure it is on PATH (https://github.com/yt-dlp/yt-dlp).",
      );
    };

    await expect(
      fetchAndCacheTranscript({
        input: "dQw4w9WgXcQ",
        cacheRoot,
        workDir,
        runYtDlp,
      }),
    ).rejects.toThrow(/yt-dlp is not installed/);
  });
});
