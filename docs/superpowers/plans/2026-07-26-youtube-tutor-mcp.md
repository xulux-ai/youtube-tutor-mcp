# YouTube Tutor MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone mcp-use TypeScript MCP server that loads YouTube videos, fetches public captions via yt-dlp, caches them under `./.cache`, and exposes tutor tools for sticky-position context and concept search.

**Architecture:** Single mcp-use server. Internal modules own time parsing, disk cache, session, yt-dlp fetch/parse, context windows, and search. Tools return grounded transcript segments; the host agent teaches. No dependency on third-party YouTube-transcript MCP packages.

**Tech Stack:** TypeScript, mcp-use (`MCPServer` from `mcp-use/server`), Zod, Vitest, yt-dlp (system CLI, `--skip-download` for captions only)

## Global Constraints

- Transparency: every successful `load_video` response includes a note that public captions were fetched and stored under `.cache`; video file was not downloaded
- Cache root: project-local `./.cache` (gitignored); paths `.cache/transcripts/<videoId>.json` and `.cache/sessions/default.json`
- Transcript source field: `"youtube-captions"` in v1 (reserve `"curated-pack"` for roadmap)
- Default caption language: `en`
- Default context half-window: `60` seconds (±60s around position)
- Do not download video/audio media; yt-dlp must use `--skip-download`
- Do not depend on kimtaeyoon83 or YouTube Data API for third-party captions
- Live YouTube tests: off unless `LIVE_YOUTUBE=1`
- Courses / `list_courses` / website packs: out of scope for this plan (roadmap only)
- Follow mcp-use mcp-builder patterns: Zod schemas with `.describe()`, `text` / `object` / `markdown` helpers

---

## File structure

```text
youtube-tutor-mcp/
├── index.ts                          # MCPServer entry; register tools/resources/prompts; listen
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── .gitignore                        # already has .cache/
├── scripts/
│   └── live-transcript-check.ts      # LIVE_YOUTUBE=1 smoke fetch
├── src/
│   ├── types.ts                      # TranscriptDoc, Segment, SessionState, etc.
│   ├── constants.ts                  # TRANSPARENCY_NOTE, DEFAULT_HALF_WINDOW_SEC, cache paths
│   ├── videoId.ts                    # parse YouTube URL / ID
│   ├── time.ts                       # parseTimestamp / formatTimestamp
│   ├── cache.ts                      # read/write transcript JSON under .cache
│   ├── session.ts                    # sticky position + active video
│   ├── transparency.ts               # transparency note helper
│   ├── transcript/
│   │   ├── vtt.ts                    # parse WebVTT → Segment[]
│   │   ├── context.ts                # window around position
│   │   ├── search.ts                 # find_concept ranking
│   │   └── fetcher.ts                # yt-dlp spawn + metadata + cache write
│   └── tools/
│       ├── loadVideo.ts
│       ├── setPosition.ts
│       ├── getContext.ts
│       ├── askAtPosition.ts          # thin wrapper over getContext + question echo
│       ├── findConcept.ts
│       └── getVideoStatus.ts
└── tests/
    ├── time.test.ts
    ├── videoId.test.ts
    ├── cache.test.ts
    ├── session.test.ts
    ├── vtt.test.ts
    ├── context.test.ts
    ├── search.test.ts
    ├── fetcher.test.ts
    ├── transparency.test.ts
    ├── tools.integration.test.ts
    └── fixtures/
        ├── sample.en.vtt
        └── sample-transcript.json
```

---

### Task 1: Scaffold mcp-use project + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `index.ts` (minimal stub)
- Modify: `.gitignore` (ensure `node_modules/`, `dist/`, `.cache/`)
- Preserve: `docs/superpowers/**`

**Interfaces:**
- Consumes: none
- Produces: runnable `npm test` / `npm run dev` scripts; dependency on `mcp-use`, `zod`, `vitest`, `typescript`

- [ ] **Step 1: Initialize package.json and install deps**

Create `package.json`:

```json
{
  "name": "youtube-tutor-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "mcp-use dev",
    "build": "mcp-use build",
    "start": "mcp-use start",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:live": "cross-env LIVE_YOUTUBE=1 vitest run tests/fetcher.live.test.ts",
    "live-check": "tsx scripts/live-transcript-check.ts"
  },
  "dependencies": {
    "mcp-use": "latest",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "cross-env": "^7.0.3",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

Run:

```bash
npm install
```

Expected: `node_modules/` created; no errors.

If `mcp-use` CLI scripts differ from `mcp-use dev` / `build` / `start`, align scripts with whatever `npx create-mcp-use-app` blank template uses after checking `node_modules/mcp-use` README — keep the same three lifecycle commands the template documents.

- [ ] **Step 2: Add TypeScript + Vitest config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["index.ts", "src/**/*.ts", "tests/**/*.ts", "scripts/**/*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/**/*.live.test.ts"],
  },
});
```

- [ ] **Step 3: Stub server entry**

`index.ts`:

```ts
import { MCPServer, text } from "mcp-use/server";

const server = new MCPServer({
  name: "youtube-tutor",
  version: "0.1.0",
  description:
    "Tutor over YouTube public captions: load a video, set a timestamp, ask questions grounded in the transcript.",
});

server.tool(
  {
    name: "ping",
    description: "Health check",
    schema: undefined as never,
  },
  async () => text("ok")
);

// Remove ping in Task 8 when real tools are registered.
server.listen().catch(console.error);
```

Adjust `schema` to whatever mcp-use requires for a no-arg tool (empty `z.object({})` if needed).

- [ ] **Step 4: Smoke-run tests**

Create `tests/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts index.ts tests/smoke.test.ts .gitignore
git commit -m "chore: scaffold youtube-tutor-mcp with mcp-use and vitest"
```

---

### Task 2: Types, constants, video ID + timestamp parsing

**Files:**
- Create: `src/types.ts`, `src/constants.ts`, `src/videoId.ts`, `src/time.ts`
- Test: `tests/videoId.test.ts`, `tests/time.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `export type Segment = { start: number; duration: number; text: string }`
  - `export type TranscriptDoc = { videoId: string; title: string; channel: string; source: "youtube-captions" | "curated-pack"; language: string; fetchedAt: string; durationSec?: number; segments: Segment[] }`
  - `export type SessionState = { activeVideoId: string | null; positionSec: number | null; updatedAt: string }`
  - `export const DEFAULT_HALF_WINDOW_SEC = 60`
  - `export const TRANSPARENCY_NOTE = "Fetched this video's public captions and stored them under .cache in this project for tutoring. The video file was not downloaded."`
  - `export function parseVideoId(input: string): string` — throws `Error` with message starting `Invalid YouTube URL or video ID:`
  - `export function parseTimestamp(input: string | number): number` — seconds; throws on invalid
  - `export function formatTimestamp(seconds: number): string` — `m:ss` or `h:mm:ss`

- [ ] **Step 1: Write failing tests**

`tests/time.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseTimestamp, formatTimestamp } from "../src/time.js";

describe("parseTimestamp", () => {
  it("parses mm:ss", () => {
    expect(parseTimestamp("12:34")).toBe(754);
  });
  it("parses h:mm:ss", () => {
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });
  it("parses numeric seconds", () => {
    expect(parseTimestamp(90)).toBe(90);
    expect(parseTimestamp("90")).toBe(90);
  });
  it("rejects garbage", () => {
    expect(() => parseTimestamp("nope")).toThrow(/Invalid timestamp/);
  });
});

describe("formatTimestamp", () => {
  it("formats under an hour", () => {
    expect(formatTimestamp(754)).toBe("12:34");
  });
  it("formats over an hour", () => {
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });
});
```

`tests/videoId.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseVideoId } from "../src/videoId.js";

describe("parseVideoId", () => {
  it("accepts bare ID", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("parses watch URL", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
  it("parses youtu.be", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("parses shorts", () => {
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
  it("rejects invalid", () => {
    expect(() => parseVideoId("not a video")).toThrow(/Invalid YouTube/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/time.test.ts tests/videoId.test.ts`  
Expected: FAIL (modules not found)

- [ ] **Step 3: Implement types, constants, parsers**

`src/types.ts` — types as listed in Interfaces.

`src/constants.ts`:

```ts
import path from "node:path";

export const DEFAULT_HALF_WINDOW_SEC = 60;
export const TRANSPARENCY_NOTE =
  "Fetched this video's public captions and stored them under .cache in this project for tutoring. The video file was not downloaded.";
export const CACHE_ROOT = path.resolve(process.cwd(), ".cache");
export const TRANSCRIPTS_DIR = path.join(CACHE_ROOT, "transcripts");
export const SESSIONS_DIR = path.join(CACHE_ROOT, "sessions");
export const DEFAULT_SESSION_PATH = path.join(SESSIONS_DIR, "default.json");
```

`src/time.ts` — implement `parseTimestamp` / `formatTimestamp` to satisfy tests.

`src/videoId.ts` — implement `parseVideoId` for bare 11-char ID, `watch?v=`, `youtu.be/`, `shorts/`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/time.test.ts tests/videoId.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/constants.ts src/time.ts src/videoId.ts tests/time.test.ts tests/videoId.test.ts
git commit -m "feat: add video id and timestamp parsing"
```

---

### Task 3: Disk cache + session store

**Files:**
- Create: `src/cache.ts`, `src/session.ts`
- Test: `tests/cache.test.ts`, `tests/session.test.ts`
- Fixture: `tests/fixtures/sample-transcript.json`

**Interfaces:**
- Consumes: `TranscriptDoc`, `SessionState`, path constants
- Produces:
  - `export async function saveTranscript(doc: TranscriptDoc): Promise<string>` — returns file path
  - `export async function loadTranscript(videoId: string): Promise<TranscriptDoc | null>`
  - `export async function transcriptExists(videoId: string): Promise<boolean>`
  - `export async function loadSession(sessionPath?: string): Promise<SessionState>`
  - `export async function saveSession(state: SessionState, sessionPath?: string): Promise<void>`
  - `export async function setActiveVideo(videoId: string): Promise<SessionState>`
  - `export async function setPosition(positionSec: number): Promise<SessionState>` — throws if no active video

- [ ] **Step 1: Write failing tests**

Make `cache.ts` / `session.ts` accept optional `rootDir` / `sessionPath` for tests.

`tests/cache.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { saveTranscript, loadTranscript, transcriptExists } from "../src/cache.js";
import type { TranscriptDoc } from "../src/types.js";

describe("cache", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "yt-tutor-"));
  });
  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("round-trips a transcript", async () => {
    const doc: TranscriptDoc = {
      videoId: "dQw4w9WgXcQ",
      title: "Sample",
      channel: "Test",
      source: "youtube-captions",
      language: "en",
      fetchedAt: "2026-07-26T00:00:00.000Z",
      segments: [{ start: 0, duration: 2, text: "hello" }],
    };
    const savedPath = await saveTranscript(doc, root);
    expect(savedPath).toContain("dQw4w9WgXcQ.json");
    expect(await transcriptExists("dQw4w9WgXcQ", root)).toBe(true);
    const loaded = await loadTranscript("dQw4w9WgXcQ", root);
    expect(loaded).toEqual(doc);
  });

  it("returns null for missing transcript", async () => {
    expect(await loadTranscript("missing_____", root)).toBeNull();
  });
});
```

`tests/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadSession,
  setActiveVideo,
  setPosition,
} from "../src/session.js";

describe("session", () => {
  let sessionPath: string;
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-sess-"));
    sessionPath = path.join(dir, "default.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("defaults to empty session", async () => {
    const s = await loadSession(sessionPath);
    expect(s.activeVideoId).toBeNull();
    expect(s.positionSec).toBeNull();
  });

  it("sets active video and position", async () => {
    await setActiveVideo("dQw4w9WgXcQ", sessionPath);
    const s = await setPosition(754, sessionPath);
    expect(s.activeVideoId).toBe("dQw4w9WgXcQ");
    expect(s.positionSec).toBe(754);
  });

  it("throws when setting position without active video", async () => {
    await expect(setPosition(10, sessionPath)).rejects.toThrow(/No active video/);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/cache.test.ts tests/session.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement cache + session**

`saveTranscript(doc, rootDir = CACHE_ROOT)` writes `rootDir/transcripts/<videoId>.json` (create dirs).  
`loadSession` returns `{ activeVideoId: null, positionSec: null, updatedAt }` if missing.  
`setPosition` requires `activeVideoId`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/cache.test.ts tests/session.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cache.ts src/session.ts tests/cache.test.ts tests/session.test.ts tests/fixtures/sample-transcript.json
git commit -m "feat: add transcript cache and session store"
```

---

### Task 4: VTT parse, context window, concept search

**Files:**
- Create: `src/transcript/vtt.ts`, `src/transcript/context.ts`, `src/transcript/search.ts`
- Test: `tests/vtt.test.ts`, `tests/context.test.ts`, `tests/search.test.ts`
- Fixture: `tests/fixtures/sample.en.vtt`

**Interfaces:**
- Consumes: `Segment`, `DEFAULT_HALF_WINDOW_SEC`
- Produces:
  - `export function parseVtt(contents: string): Segment[]`
  - `export function getContextWindow(segments: Segment[], positionSec: number, halfWindowSec = DEFAULT_HALF_WINDOW_SEC): { positionSec: number; startSec: number; endSec: number; segments: Segment[] }`
  - `export type ConceptHit = { start: number; timestamp: string; quote: string; score: number }`
  - `export function findConcept(segments: Segment[], query: string, limit = 5): ConceptHit[]`

- [ ] **Step 1: Write fixture + failing tests**

`tests/fixtures/sample.en.vtt`:

```vtt
WEBVTT

00:00:01.000 --> 00:00:04.000
Hello and welcome to the lecture

00:12:30.000 --> 00:12:35.000
Attention is all you need in transformers

00:20:00.000 --> 00:20:05.000
Backpropagation updates the weights
```

Tests:
- `parseVtt` returns 3 segments; second starts at `750`
- `getContextWindow(segments, 754, 60)` includes the attention line; excludes backpropagation (1200)
- `findConcept(segments, "attention")` top hit timestamp `12:30` (or `12:30:00` formatted via `formatTimestamp`)
- `findConcept(segments, "backprop")` hits the backprop line (substring / case-insensitive)

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/vtt.test.ts tests/context.test.ts tests/search.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement parsers**

- VTT: skip header/`NOTE`/styles; parse cue times `HH:MM:SS.mmm`; set `duration = end - start`; join multi-line cue text; strip tags like `<c>` if present
- Context: include segment if it overlaps `[position - half, position + half]`
- Search: case-insensitive; score by phrase match > all tokens present > partial token count; stable sort by score desc then start asc; return `quote` trimmed, `timestamp` via `formatTimestamp(start)`

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/vtt.test.ts tests/context.test.ts tests/search.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/transcript/vtt.ts src/transcript/context.ts src/transcript/search.ts tests/vtt.test.ts tests/context.test.ts tests/search.test.ts tests/fixtures/sample.en.vtt
git commit -m "feat: parse VTT and add context window + concept search"
```

---

### Task 5: yt-dlp transcript fetcher (mocked + live gate)

**Files:**
- Create: `src/transcript/fetcher.ts`, `scripts/live-transcript-check.ts`, `tests/fetcher.test.ts`, `tests/fetcher.live.test.ts`
- Modify: `vitest.config.ts` if needed (live file already excluded from default `npm test`)

**Interfaces:**
- Consumes: `parseVideoId`, `parseVtt`, `saveTranscript`, `loadTranscript`, `transcriptExists`
- Produces:
  - `export type RunYtDlp = (args: string[], opts: { cwd: string }) => Promise<{ stdout: string; stderr: string; code: number }>`
  - `export async function fetchAndCacheTranscript(opts: { input: string; language?: string; cacheRoot?: string; runYtDlp?: RunYtDlp; workDir?: string }): Promise<{ doc: TranscriptDoc; fromCache: boolean; transparencyNote: string }>`
  - Behavior:
    1. Parse video ID
    2. If cache hit → return `{ fromCache: true, ... }`
    3. Else run yt-dlp roughly:
       - `yt-dlp --skip-download --write-subs --write-auto-subs --sub-langs <lang>.* --sub-format vtt --print "%(title)s" --print "%(channel)s" --print "%(duration)s" -o "<workDir>/<videoId>" <url>`
       - Prefer flags that write only subs (never media). Exact argv may be adjusted while keeping `--skip-download`.
    4. Find written `.vtt` under workDir; `parseVtt`; build `TranscriptDoc` with `source: "youtube-captions"`; `saveTranscript`
    5. On missing binary: throw `Error` including `yt-dlp is not installed`
    6. On no captions: throw `Error` including `No captions available`
  - Always attach `TRANSPARENCY_NOTE` on success

- [ ] **Step 1: Write failing unit test with injected runner**

```ts
// tests/fetcher.test.ts — inject runYtDlp that writes sample.en.vtt into workDir
// and returns code 0 with title/channel/duration on stdout lines.
// Assert fromCache false first call, true second call; segments non-empty;
// result.transparencyNote === TRANSPARENCY_NOTE.
// Also test: runner code !== 0 with stderr about missing subs → throws /No captions/
```

- [ ] **Step 2: Run unit test — expect FAIL**

Run: `npm test -- tests/fetcher.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement fetcher**

Default `runYtDlp` uses `import { spawn } from "node:child_process"` promisified; on `ENOENT` throw install guidance.

Use a temp `workDir` under `os.tmpdir()` for yt-dlp outputs; do not leave media files; prefer deleting temp dir in `finally`.

- [ ] **Step 4: Pass unit tests**

Run: `npm test -- tests/fetcher.test.ts`  
Expected: PASS

- [ ] **Step 5: Add live test + script (gated)**

`tests/fetcher.live.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { fetchAndCacheTranscript } from "../src/transcript/fetcher.js";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const live = process.env.LIVE_YOUTUBE === "1";

describe.skipIf(!live)("live yt-dlp", () => {
  it("fetches captions for a stable public video", async () => {
    const cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "yt-live-"));
    // Short Creative Commons / known-captioned video — replace ID if flaky
    const { doc, fromCache } = await fetchAndCacheTranscript({
      input: "jNQXAC9IVRw", // "Me at the zoo" — has captions; swap if needed
      cacheRoot,
    });
    expect(fromCache).toBe(false);
    expect(doc.segments.length).toBeGreaterThan(0);
    expect(doc.segments[0].text.length).toBeGreaterThan(0);
  }, 120_000);
});
```

`scripts/live-transcript-check.ts`: call fetcher for one URL, print segment count, exit 1 on failure.

Document in README: requires `yt-dlp` on PATH; `npm run test:live` / `npm run live-check`.

- [ ] **Step 6: Run default tests (live skipped) + optional live**

Run: `npm test`  
Expected: PASS; live file not run

If yt-dlp available: `npm run test:live`  
Expected: PASS (or adjust video ID if captions missing)

- [ ] **Step 7: Commit**

```bash
git add src/transcript/fetcher.ts tests/fetcher.test.ts tests/fetcher.live.test.ts scripts/live-transcript-check.ts
git commit -m "feat: fetch YouTube captions via yt-dlp with cache"
```

---

### Task 6: Tool handlers (pure logic)

**Files:**
- Create: `src/tools/loadVideo.ts`, `src/tools/setPosition.ts`, `src/tools/getContext.ts`, `src/tools/askAtPosition.ts`, `src/tools/findConcept.ts`, `src/tools/getVideoStatus.ts`
- Test: `tests/tools.integration.test.ts` (handler-level, temp cache root)

**Interfaces:**
- Consumes: fetcher, session, cache, context, search, time
- Produces async handler functions returning plain objects (not MCP wrappers yet):

```ts
// loadVideo
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
}>;

// setPositionHandler({ timestamp: string | number, sessionPath? })
// → { videoId, positionSec, positionLabel }

// getContextHandler({ timestamp?: string | number, halfWindowSec?: number, cacheRoot?, sessionPath? })
// → { videoId, positionSec, positionLabel, startSec, endSec, segments: Segment[] }

// askAtPositionHandler({ question: string, timestamp?: ..., ... })
// → same as getContext plus { question }

// findConceptHandler({ query: string, limit?: number, ... })
// → { videoId, query, hits: ConceptHit[] }

// getVideoStatusHandler(...)
// → { activeVideoId, positionSec, positionLabel, cached, language, title, segmentCount }
```

Rules:
- `getContext` / `askAtPosition` / `findConcept` throw `/No active video/` if none
- `getContext` without timestamp uses sticky position; if neither set, throw `/No position set/`
- Optional `timestamp` overrides sticky for that call without necessarily clearing sticky (override only for the call; `askAtPosition` same)
- `setPosition` updates sticky

- [ ] **Step 1: Write integration tests with mocked `runYtDlp`**

Flow:
1. `loadVideoHandler` with mock → `fromCache: false`, transparency note present
2. `setPositionHandler("12:34")` → `positionSec === 754`
3. `getContextHandler({})` → segments include fixture attention line
4. `findConceptHandler({ query: "attention" })` → hit with timestamp
5. `askAtPositionHandler({ question: "what is attention?" })` → includes `question` + segments
6. `getVideoStatusHandler` → reflects active video + position + cached true

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/tools.integration.test.ts`  
Expected: FAIL

- [ ] **Step 3: Implement handlers**

Keep handlers free of mcp-use imports so tests stay unit-simple.

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- tests/tools.integration.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools tests/tools.integration.test.ts
git commit -m "feat: add tutor tool handlers with integration tests"
```

---

### Task 7: Wire MCP server (tools, resources, prompts)

**Files:**
- Modify: `index.ts` — remove `ping`; register real tools/resources/prompts
- Test: extend `tests/tools.integration.test.ts` or add `tests/mcp.smoke.test.ts` only if mcp-use exposes an in-process test harness; otherwise verify via Inspector manually in Step 4

**Interfaces:**
- Consumes: all handlers
- Produces: MCP tools with Zod schemas:

| Tool | Schema fields |
|------|----------------|
| `load_video` | `url: string`, `language?: string` |
| `set_position` | `timestamp: string` (also accept number via coerce if Zod allows union) |
| `get_context` | `timestamp?: string`, `halfWindowSec?: number` |
| `ask_at_position` | `question: string`, `timestamp?: string`, `halfWindowSec?: number` |
| `find_concept` | `query: string`, `limit?: number` |
| `get_video_status` | empty object |

Resources:
- `session://current` → JSON session + labels
- `transcript://{videoId}` via `resourceTemplate`
- `transcript://{videoId}/at/{seconds}` via template — return context window JSON

Prompts:
- `tutor_explain` — instructs model to use only provided segments and cite timestamps
- `tutor_find` — instructs model to point user to rewind times from hits

Each tool handler returns `object(result)` or `text(JSON.stringify(result, null, 2))` — prefer `object` if supported.

- [ ] **Step 1: Register tools in index.ts**

```ts
import { MCPServer, object, markdown } from "mcp-use/server";
import { z } from "zod";
import { loadVideoHandler } from "./src/tools/loadVideo.js";
// ... other imports
import { TRANSPARENCY_NOTE } from "./src/constants.js";

const server = new MCPServer({
  name: "youtube-tutor",
  version: "0.1.0",
  description:
    "Tutor over YouTube public captions. Loads captions into .cache, supports sticky timestamps and concept search. Does not download video files.",
});

server.tool(
  {
    name: "load_video",
    description:
      "Load a YouTube video by URL or ID. Fetches public captions if not cached, stores them under .cache, and sets the active video for tutoring.",
    schema: z.object({
      url: z.string().describe("YouTube URL or 11-character video ID"),
      language: z
        .string()
        .optional()
        .describe("Caption language code, default en"),
    }),
  },
  async ({ url, language }) => object(await loadVideoHandler({ url, language }))
);

// register set_position, get_context, ask_at_position, find_concept, get_video_status similarly
```

- [ ] **Step 2: Register resources + prompts**

Implement `session://current` and transcript templates using `loadTranscript` / `getContextWindow` / `formatTimestamp`.

`tutor_explain` prompt body must say: use only provided transcript segments; cite timestamps; do not invent quotes.

- [ ] **Step 3: Run full unit/integration suite**

Run: `npm test`  
Expected: all PASS

- [ ] **Step 4: Manual Inspector check**

Run: `npm run dev`  
Open mcp-use Inspector (template default, often `http://localhost:3000/inspector`).  
Exercise: `load_video` (mock not available here — needs real yt-dlp) on a short captioned video → `set_position` → `get_context` → `find_concept`.  
Expected: transparency note visible; segments timed.

- [ ] **Step 5: Commit**

```bash
git add index.ts
git commit -m "feat: register youtube tutor MCP tools, resources, and prompts"
```

---

### Task 8: README, agent-behavior checklist, polish

**Files:**
- Create: `README.md`, `docs/superpowers/plans/agent-behavior-checklist.md` (or section in README)
- Modify: `package.json` scripts if needed; delete `tests/smoke.test.ts` if redundant

**Interfaces:**
- Consumes: none (docs)
- Produces: user-facing docs + eval checklist

- [ ] **Step 1: Write README**

Must include:
- What it does / does not do (no video download; public captions only; local `.cache`)
- Prerequisites: Node 22+, `yt-dlp` on PATH
- Install / `npm run dev` / Cursor MCP config example (stdio or HTTP per mcp-use docs)
- Tool list + example dialogue (“I’m at 12:34…” / “I’m confused about…”)
- Testing: `npm test`, `npm run test:live`, `npm run live-check`
- Roadmap one-liner: curated courses / website packs later (`list_courses`, etc.) — not in v1
- Credit: inspired by community transcript MCPs; own yt-dlp-based implementation

Cursor config example (adjust command to match mcp-use start):

```json
{
  "mcpServers": {
    "youtube-tutor": {
      "command": "npx",
      "args": ["tsx", "index.ts"],
      "cwd": "/absolute/path/to/youtube-tutor-mcp"
    }
  }
}
```

(If mcp-use stdio entry differs, document the official recommended Cursor wiring from mcp-use docs.)

- [ ] **Step 2: Agent-behavior checklist**

Add `docs/superpowers/evals/agent-behavior-checklist.md`:

```markdown
# Agent behavior checklist

Run with the MCP connected. For each scenario, record whether the agent used the expected tools and cited timestamps.

## Scenario A — sticky position
**User:** Load https://www.youtube.com/watch?v=<captioned-id> then: I'm at 1:00. What is being explained?
**Expect tools:** `load_video`, `set_position`, `get_context` (or `ask_at_position`)
**Expect answer:** Uses transcript quotes; cites ~1:00
**Pass/Fail:**

## Scenario B — concept find
**User:** (video already loaded) I'm confused about <term in that video>
**Expect tools:** `find_concept` (and optionally `get_context` on a hit)
**Expect answer:** Points to at least one timestamp; does not invent a time with no hit
**Pass/Fail:**

## Scenario C — no silent hallucinated transcript
**User:** Ask a detailed question without loading a video
**Expect:** Agent calls `load_video` or reports no active video — does not invent lecture content
**Pass/Fail:**
```

- [ ] **Step 3: Run full test suite once more**

Run: `npm test`  
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/evals/agent-behavior-checklist.md
git commit -m "docs: README, transparency, and agent behavior checklist"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| Load video by URL/ID | 5, 6, 7 |
| Public captions via own yt-dlp path | 5 |
| Local `./.cache` transcripts + session | 3, 5 |
| Transparency note | 2 (constant), 5–7 |
| Sticky `set_position` | 3, 6, 7 |
| `get_context` window | 4, 6, 7 |
| `ask_at_position` | 6, 7 |
| `find_concept` | 4, 6, 7 |
| `get_video_status` | 6, 7 |
| Resources + prompts | 7 |
| Explicit errors | 5, 6 |
| Unit / integration / live-gated tests | 2–6 |
| Agent-behavior checks | 8 |
| Local first, remote later | 7–8 (README deploy note) |
| Curated courses / website | Out of scope (README roadmap only) |
| No kimtaeyoon83 / no Drive CDN | Global constraints |

**Plan-time resolutions:** template-equivalent manual scaffold (preserve docs); half-window `60`; keep `ask_at_position` as thin wrapper; live tests gated on `LIVE_YOUTUBE=1`.

---

## Execution notes

- Prefer **subagent-driven-development** per task with review between tasks.
- Ensure `yt-dlp` is installed before Task 7 manual Inspector / Task 5 live tests.
- Do not implement course catalog tools in this plan.
