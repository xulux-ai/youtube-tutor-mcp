import path from "node:path";

export const DEFAULT_HALF_WINDOW_SEC = 60;
export const TRANSPARENCY_NOTE =
  "Fetched this video's public captions and stored them under .cache in this project for tutoring. The video file was not downloaded.";
export const CACHE_ROOT = path.resolve(process.cwd(), ".cache");
export const TRANSCRIPTS_DIR = path.join(CACHE_ROOT, "transcripts");
export const SESSIONS_DIR = path.join(CACHE_ROOT, "sessions");
export const DEFAULT_SESSION_PATH = path.join(SESSIONS_DIR, "default.json");
