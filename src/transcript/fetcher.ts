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

/** Exported for focused unit tests of spawn/ENOENT handling. */
export async function defaultRunYtDlp(
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
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    // stdio can be null on ENOENT (binary missing) — never attach without a null-check
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      settle(() => {
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
    });

    child.on("close", (code) => {
      settle(() => {
        resolve({ stdout, stderr, code: code ?? 1 });
      });
    });
  });
}

async function collectVttFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectVttFiles(full)));
    } else if (entry.name.toLowerCase().endsWith(".vtt")) {
      found.push(full);
    }
  }
  return found;
}

/** Prefer exact `.<lang>.vtt` over `.<lang>-orig.vtt` / other variants. */
async function findVttFile(
  dir: string,
  language: string,
): Promise<string | null> {
  const files = await collectVttFiles(dir);
  if (files.length === 0) return null;
  const lowerLang = language.toLowerCase();
  const exact = files.find((f) =>
    path.basename(f).toLowerCase().endsWith(`.${lowerLang}.vtt`),
  );
  if (exact) return exact;
  return files[0] ?? null;
}

async function readInfoJson(
  dir: string,
  videoId: string,
): Promise<{ title?: string; channel?: string; durationSec?: number }> {
  const preferred = path.join(dir, `${videoId}.info.json`);
  const candidates = [preferred];
  try {
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (name.endsWith(".info.json")) {
        candidates.push(path.join(dir, name));
      }
    }
  } catch {
    // ignore
  }

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate, "utf8");
      const data = JSON.parse(raw) as {
        title?: string;
        channel?: string;
        uploader?: string;
        duration?: number;
      };
      const durationSec =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : undefined;
      return {
        title: data.title,
        channel: data.channel ?? data.uploader,
        durationSec,
      };
    } catch {
      // try next
    }
  }
  return {};
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
    // Note: do NOT use --print here — in current yt-dlp it implies simulate
    // and skips writing subtitle files.
    const args = [
      "--skip-download",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      `${language}.*`,
      "--sub-format",
      "vtt",
      "--write-info-json",
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

    const vttPath = await findVttFile(workDir, language);
    if (!vttPath) {
      throw new Error(`No captions available for ${videoId}`);
    }

    const vttContents = await fs.readFile(vttPath, "utf8");
    const segments = parseVtt(vttContents);
    if (segments.length === 0) {
      throw new Error(`No captions available for ${videoId}`);
    }

    const meta = await readInfoJson(workDir, videoId);
    const title = meta.title?.trim() || videoId;
    const channel = meta.channel?.trim() || "";
    const durationSec = meta.durationSec;

    const doc: TranscriptDoc = {
      videoId,
      title,
      channel,
      source: "youtube-captions",
      language,
      fetchedAt: new Date().toISOString(),
      ...(durationSec != null && Number.isFinite(durationSec)
        ? { durationSec }
        : {}),
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
