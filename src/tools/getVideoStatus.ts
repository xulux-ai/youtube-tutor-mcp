import { loadSession } from "../session.js";
import { loadTranscript, transcriptExists } from "../cache.js";
import { formatTimestamp } from "../time.js";
import { getCacheRoot, getDefaultSessionPath } from "../constants.js";

export async function getVideoStatusHandler(input: {
  cacheRoot?: string;
  sessionPath?: string;
} = {}): Promise<{
  activeVideoId: string | null;
  positionSec: number | null;
  positionLabel: string | null;
  cached: boolean;
  language: string | null;
  title: string | null;
  segmentCount: number | null;
}> {
  const cacheRoot = input.cacheRoot ?? getCacheRoot();
  const sessionPath = input.sessionPath ?? getDefaultSessionPath();
  const session = await loadSession(sessionPath);

  if (!session.activeVideoId) {
    return {
      activeVideoId: null,
      positionSec: null,
      positionLabel: null,
      cached: false,
      language: null,
      title: null,
      segmentCount: null,
    };
  }

  const cached = await transcriptExists(session.activeVideoId, cacheRoot);
  const doc = cached
    ? await loadTranscript(session.activeVideoId, cacheRoot)
    : null;

  return {
    activeVideoId: session.activeVideoId,
    positionSec: session.positionSec,
    positionLabel:
      session.positionSec != null
        ? formatTimestamp(session.positionSec)
        : null,
    cached,
    language: doc?.language ?? null,
    title: doc?.title ?? null,
    segmentCount: doc?.segments.length ?? null,
  };
}
