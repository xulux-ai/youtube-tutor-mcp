import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CACHE_ROOT, TRANSPARENCY_NOTE } from "../constants.js";
import { loadTranscript, saveTranscript, transcriptExists } from "../cache.js";
import type { TranscriptDoc } from "../types.js";
import { parseVideoId } from "../videoId.js";
import { parseVtt } from "./vtt.js";

export type RunYtDlp = (
  args: string[],
  opts: { cwd: string },
) => Promise<{ stdout: string; stderr: string; code: number }>;

async function defaultRunYtDlp(
  args: string[],
  opts: { cwd: string },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("yt-dlp", args, {
      cwd: opts.cwd,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "yt-dlp is not installed. Install yt-dlp and ensure it is on PATH (https://github.com/yt-dlp/yt-dlp).",
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

async function findVttFile(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findVttFile(full);
      if (nested) return nested;
    } else if (entry.name.toLowerCase().endsWith(".vtt")) {
      return full;
    }
  }
  return null;
}

function buildYoutubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function fetchAndCacheTranscript(opts: {
  input: string;
  language?: string;
  cacheRoot?: string;
  runYtDlp?: RunYtDlp;
  workDir?: string;
}): Promise<{
  doc: TranscriptDoc;
  fromCache: boolean;
  transparencyNote: string;
}> {
  const language = opts.language ?? "en";
  const cacheRoot = opts.cacheRoot ?? CACHE_ROOT;
  const runYtDlp = opts.runYtDlp ?? defaultRunYtDlp;
  const videoId = parseVideoId(opts.input);

  if (await transcriptExists(videoId, cacheRoot)) {
    const cached = await loadTranscript(videoId, cacheRoot);
    if (!cached) {
      throw new Error(`Cache reported hit but transcript missing for ${videoId}`);
    }
    return {
      doc: cached,
      fromCache: true,
      transparencyNote: TRANSPARENCY_NOTE,
    };
  }

  const ownsWorkDir = !opts.workDir;
  const workDir =
    opts.workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), "yt-dlp-")));

  try {
    const outputTemplate = path.join(workDir, videoId);
    const args = [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      `${language}.*`,
      "--sub-format",
      "vtt",
      "--print",
      "%(title)s",
      "--print",
      "%(channel)s",
      "--print",
      "%(duration)s",
      "-o",
      outputTemplate,
      buildYoutubeUrl(videoId),
    ];

    const result = await runYtDlp(args, { cwd: workDir });

    if (result.code !== 0) {
      const detail = (result.stderr || result.stdout || "").trim();
      throw new Error(
        detail
          ? `No captions available for ${videoId}: ${detail}`
          : `No captions available for ${videoId}`,
      );
    }

    const vttPath = await findVttFile(workDir);
    if (!vttPath) {
      throw new Error(`No captions available for ${videoId}`);
    }

    const vttContents = await fs.readFile(vttPath, "utf8");
    const segments = parseVtt(vttContents);
    if (segments.length === 0) {
      throw new Error(`No captions available for ${videoId}`);
    }

    const metaLines = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const title = metaLines[0] ?? videoId;
    const channel = metaLines[1] ?? "";
    const durationRaw = metaLines[2];
    const durationSec = durationRaw != null ? Number(durationRaw) : undefined;

    const doc: TranscriptDoc = {
      videoId,
      title,
      channel,
      source: "youtube-captions",
      language,
      fetchedAt: new Date().toISOString(),
      ...(Number.isFinite(durationSec) ? { durationSec } : {}),
      segments,
    };

    await saveTranscript(doc, cacheRoot);

    return {
      doc,
      fromCache: false,
      transparencyNote: TRANSPARENCY_NOTE,
    };
  } finally {
    if (ownsWorkDir) {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}
