import { loadSession } from "../session.js";
import { loadTranscript } from "../cache.js";
import { findConcept, type ConceptHit } from "../transcript/search.js";
import { CACHE_ROOT, DEFAULT_SESSION_PATH } from "../constants.js";

export async function findConceptHandler(input: {
  query: string;
  limit?: number;
  cacheRoot?: string;
  sessionPath?: string;
}): Promise<{
  videoId: string;
  query: string;
  hits: ConceptHit[];
}> {
  const cacheRoot = input.cacheRoot ?? CACHE_ROOT;
  const sessionPath = input.sessionPath ?? DEFAULT_SESSION_PATH;
  const session = await loadSession(sessionPath);

  if (!session.activeVideoId) {
    throw new Error("No active video");
  }

  const doc = await loadTranscript(session.activeVideoId, cacheRoot);
  if (!doc) {
    throw new Error(`No cached transcript for ${session.activeVideoId}`);
  }

  const hits = findConcept(doc.segments, input.query, input.limit);

  return {
    videoId: session.activeVideoId,
    query: input.query,
    hits,
  };
}
