import path from "node:path";

export const DEFAULT_HALF_WINDOW_SEC = 60;
export const TRANSPARENCY_NOTE =
  "Fetched this video's public captions and stored them under .cache in this project for tutoring. The video file was not downloaded.";

/** Override with TUTOR_CACHE_ROOT for isolated agent evals. */
export function getCacheRoot(): string {
  return path.resolve(process.env.TUTOR_CACHE_ROOT ?? path.join(process.cwd(), ".cache"));
}

export function getTranscriptsDir(): string {
  return path.join(getCacheRoot(), "transcripts");
}

export function getSessionsDir(): string {
  return path.join(getCacheRoot(), "sessions");
}

export function getDefaultSessionPath(): string {
  return (
    process.env.TUTOR_SESSION_PATH ??
    path.join(getSessionsDir(), "default.json")
  );
}

/** @deprecated Prefer getCacheRoot() — kept for existing imports; resolved at module load. */
export const CACHE_ROOT = getCacheRoot();
/** @deprecated Prefer getTranscriptsDir() */
export const TRANSCRIPTS_DIR = getTranscriptsDir();
/** @deprecated Prefer getSessionsDir() */
export const SESSIONS_DIR = getSessionsDir();
/** @deprecated Prefer getDefaultSessionPath() */
export const DEFAULT_SESSION_PATH = getDefaultSessionPath();
