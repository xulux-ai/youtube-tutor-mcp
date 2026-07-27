import { loadSession } from "../session.js";
import { loadTranscript } from "../cache.js";
import { getContextWindow } from "../transcript/context.js";
import { formatTimestamp, parseTimestamp } from "../time.js";
import { CACHE_ROOT, DEFAULT_SESSION_PATH } from "../constants.js";
import type { Segment } from "../types.js";

export async function getContextHandler(input: {
  timestamp?: string | number;
  halfWindowSec?: number;
  cacheRoot?: string;
  sessionPath?: string;
}): Promise<{
  videoId: string;
  positionSec: number;
  positionLabel: string;
  startSec: number;
  endSec: number;
  segments: Segment[];
}> {
  const cacheRoot = input.cacheRoot ?? CACHE_ROOT;
  const sessionPath = input.sessionPath ?? DEFAULT_SESSION_PATH;
  const session = await loadSession(sessionPath);

  if (!session.activeVideoId) {
    throw new Error("No active video");
  }

  const positionSec =
    input.timestamp !== undefined
      ? parseTimestamp(input.timestamp)
      : session.positionSec;

  if (positionSec == null) {
    throw new Error("No position set");
  }

  const doc = await loadTranscript(session.activeVideoId, cacheRoot);
  if (!doc) {
    throw new Error(`No cached transcript for ${session.activeVideoId}`);
  }

  const window = getContextWindow(
    doc.segments,
    positionSec,
    input.halfWindowSec,
  );

  return {
    videoId: session.activeVideoId,
    positionSec: window.positionSec,
    positionLabel: formatTimestamp(window.positionSec),
    startSec: window.startSec,
    endSec: window.endSec,
    segments: window.segments,
  };
}
