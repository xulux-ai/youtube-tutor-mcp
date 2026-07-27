import fs from "node:fs/promises";
import path from "node:path";
import { getCacheRoot } from "./constants.js";
import type { TranscriptDoc } from "./types.js";

function transcriptsDir(rootDir: string): string {
  return path.join(rootDir, "transcripts");
}

function transcriptPath(videoId: string, rootDir: string): string {
  return path.join(transcriptsDir(rootDir), `${videoId}.json`);
}

export async function saveTranscript(
  doc: TranscriptDoc,
  rootDir: string = getCacheRoot(),
): Promise<string> {
  const dir = transcriptsDir(rootDir);
  await fs.mkdir(dir, { recursive: true });
  const filePath = transcriptPath(doc.videoId, rootDir);
  await fs.writeFile(filePath, JSON.stringify(doc, null, 2), "utf8");
  return filePath;
}

export async function loadTranscript(
  videoId: string,
  rootDir: string = getCacheRoot(),
): Promise<TranscriptDoc | null> {
  const filePath = transcriptPath(videoId, rootDir);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as TranscriptDoc;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

export async function transcriptExists(
  videoId: string,
  rootDir: string = getCacheRoot(),
): Promise<boolean> {
  const doc = await loadTranscript(videoId, rootDir);
  return doc !== null;
}
