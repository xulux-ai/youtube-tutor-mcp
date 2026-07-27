import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SESSION_PATH } from "./constants.js";
import type { SessionState } from "./types.js";

function defaultSession(): SessionState {
  return {
    activeVideoId: null,
    positionSec: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadSession(
  sessionPath: string = DEFAULT_SESSION_PATH,
): Promise<SessionState> {
  try {
    const raw = await fs.readFile(sessionPath, "utf8");
    return JSON.parse(raw) as SessionState;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultSession();
    }
    throw err;
  }
}

export async function saveSession(
  state: SessionState,
  sessionPath: string = DEFAULT_SESSION_PATH,
): Promise<void> {
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, JSON.stringify(state, null, 2), "utf8");
}

export async function setActiveVideo(
  videoId: string,
  sessionPath: string = DEFAULT_SESSION_PATH,
): Promise<SessionState> {
  const state = await loadSession(sessionPath);
  const next: SessionState = {
    ...state,
    activeVideoId: videoId,
    positionSec: null,
    updatedAt: new Date().toISOString(),
  };
  await saveSession(next, sessionPath);
  return next;
}

export async function setPosition(
  positionSec: number,
  sessionPath: string = DEFAULT_SESSION_PATH,
): Promise<SessionState> {
  const state = await loadSession(sessionPath);
  if (!state.activeVideoId) {
    throw new Error("No active video");
  }
  const next: SessionState = {
    ...state,
    positionSec,
    updatedAt: new Date().toISOString(),
  };
  await saveSession(next, sessionPath);
  return next;
}
