import { fetchAndCacheTranscript, type RunYtDlp } from "../transcript/fetcher.js";
import { setActiveVideo } from "../session.js";
import { CACHE_ROOT, DEFAULT_SESSION_PATH } from "../constants.js";

function buildPreview(texts: string[], maxChars = 280): string {
  const joined = texts.map((t) => t.trim()).filter(Boolean).join(" ");
  if (joined.length <= maxChars) return joined;
  return `${joined.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function loadVideoHandler(input: {
  url: string;
  language?: string;
  cacheRoot?: string;
  sessionPath?: string;
  runYtDlp?: RunYtDlp;
}): Promise<{
  videoId: string;
  title: string;
  channel: string;
  language: string;
  fromCache: boolean;
  segmentCount: number;
  preview: string;
  transparencyNote: string;
}> {
  const cacheRoot = input.cacheRoot ?? CACHE_ROOT;
  const sessionPath = input.sessionPath ?? DEFAULT_SESSION_PATH;

  const { doc, fromCache, transparencyNote } = await fetchAndCacheTranscript({
    input: input.url,
    language: input.language,
    cacheRoot,
    runYtDlp: input.runYtDlp,
  });

  await setActiveVideo(doc.videoId, sessionPath);

  return {
    videoId: doc.videoId,
    title: doc.title,
    channel: doc.channel,
    language: doc.language,
    fromCache,
    segmentCount: doc.segments.length,
    preview: buildPreview(doc.segments.map((s) => s.text)),
    transparencyNote,
  };
}
