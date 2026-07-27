import { fetchAndCacheTranscript } from "../src/transcript/fetcher.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const input = process.argv[2] ?? "jNQXAC9IVRw";

async function main(): Promise<void> {
  const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yt-live-check-"));
  try {
    const { doc, fromCache, transparencyNote } = await fetchAndCacheTranscript({
      input,
      cacheRoot,
    });
    console.log(`videoId=${doc.videoId}`);
    console.log(`title=${doc.title}`);
    console.log(`fromCache=${fromCache}`);
    console.log(`segments=${doc.segments.length}`);
    console.log(transparencyNote);
  } finally {
    await fs.rm(cacheRoot, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
