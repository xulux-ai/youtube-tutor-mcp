/**
 * Live tutor smoke: load a video, set position near t=1s, get context, find a concept.
 * Usage: npx tsx scripts/tutor-smoke.ts [youtube-url-or-id]
 * Requires yt-dlp on PATH.
 */
import path from "node:path";
import { CACHE_ROOT, DEFAULT_SESSION_PATH } from "../src/constants.js";
import { loadVideoHandler } from "../src/tools/loadVideo.js";
import { setPositionHandler } from "../src/tools/setPosition.js";
import { getContextHandler } from "../src/tools/getContext.js";
import { findConceptHandler } from "../src/tools/findConcept.js";
import { getVideoStatusHandler } from "../src/tools/getVideoStatus.js";

const input =
  process.argv[2] ?? "https://www.youtube.com/watch?v=VMj-3S1tku0&t=1s";

async function main(): Promise<void> {
  const cacheRoot = CACHE_ROOT;
  const sessionPath = DEFAULT_SESSION_PATH;

  console.log("cacheRoot=", cacheRoot);
  console.log("loading", input);

  const loaded = await loadVideoHandler({ url: input, cacheRoot, sessionPath });
  console.log("\n=== load-video ===");
  console.log({
    videoId: loaded.videoId,
    title: loaded.title,
    channel: loaded.channel,
    fromCache: loaded.fromCache,
    segmentCount: loaded.segmentCount,
    preview: loaded.preview.slice(0, 160),
    transparencyNote: loaded.transparencyNote,
  });

  const position = await setPositionHandler({
    timestamp: "0:01",
    sessionPath,
  });
  console.log("\n=== set-position 0:01 ===");
  console.log(position);

  const ctx = await getContextHandler({
    halfWindowSec: 45,
    cacheRoot,
    sessionPath,
  });
  console.log("\n=== get-context (±45s) ===");
  console.log({
    positionLabel: ctx.positionLabel,
    startSec: ctx.startSec,
    endSec: ctx.endSec,
    segmentCount: ctx.segments.length,
    sample: ctx.segments.slice(0, 4).map((s) => ({
      start: s.start,
      text: s.text.slice(0, 100),
    })),
  });

  const hits = await findConceptHandler({
    query: "derivative",
    limit: 5,
    cacheRoot,
    sessionPath,
  });
  console.log("\n=== find-concept 'derivative' ===");
  console.log(
    hits.hits.map((h) => ({
      timestamp: h.timestamp,
      score: h.score,
      quote: h.quote.slice(0, 120),
    })),
  );

  const status = await getVideoStatusHandler({ cacheRoot, sessionPath });
  console.log("\n=== get-video-status ===");
  console.log(status);

  console.log("\nCached file:", path.join(cacheRoot, "transcripts", `${loaded.videoId}.json`));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
