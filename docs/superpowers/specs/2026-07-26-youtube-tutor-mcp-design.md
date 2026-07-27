# YouTube Tutor MCP — Design Spec

**Date:** 2026-07-26  
**Status:** Draft for review  
**Stack:** TypeScript MCP server via [mcp-use](https://mcp-use.com) (`create-mcp-use-app`)

## 1. Intent

A standalone **YouTube Tutor MCP** that:

1. Loads a YouTube video the user requests
2. Fetches its **public captions / transcript**
3. Caches the transcript locally in the project
4. Lets the host agent (Cursor / Claude / etc.) teach from timestamp-grounded context

**Primary UX (v1 — tutor mode):**

- User: “I’m at 12:34” → sticky position → questions answered from that segment (+ surrounding context)
- User: “I’m confused about ____” → search transcript → explain using hits → point user to rewind timestamps

**Not in v1:** video download, silent scraping product, course platform, shared global transcript CDN.

**Guided lessons / courses:** later, on the same server (see Roadmap).

## 2. Principles

1. **Upfront and clear** — README and tool responses state exactly what is fetched (public captions already exposed for accessibility), that they are stored under `./.cache` for the user’s own learning, and that the video file is not downloaded.
2. **Own the transcript path** — Inspired by projects like [kimtaeyoon83/mcp-server-youtube-transcript](https://github.com/kimtaeyoon83/mcp-server-youtube-transcript), but implement our own robust fetcher (prefer yt-dlp-based extraction). Do not depend on that package as a runtime dependency.
3. **MCP provides context; agent teaches** — Tools return segments, timestamps, and search hits. The host model writes explanations.
4. **Tutor first** — Sticky position + concept find. Courses later.
5. **Local first, remote later** — Excellent local MCP; HTTP / mcp-use deploy when ready.
6. **YAGNI** — No quizzes, course graphs, or shared caption hosting in v1.
7. **Test-heavy** — Unit, integration, MCP tool, and agent-behavior checks are required, not optional polish.

## 3. Architecture

```text
User ↔ Host agent (Cursor / Claude / …)
              ↕ MCP tools / resources / prompts
     YouTube Tutor Server (mcp-use, TypeScript)
       ├─ session store   (active video + sticky position)
       ├─ transcript cache (./.cache/…)
       └─ transcript fetcher (yt-dlp primary path)
```

**Approach:** Single mcp-use tutor server with an internal transcript module (Approach A). Not a thin wrapper around an existing flaky transcript MCP. Not a standalone LLM-in-the-loop agent app for v1 (mcp-use agent optional later).

**Bootstrap:** Follow mcp-use `mcp-builder` skill — `npx create-mcp-use-app` with `blank` or `starter` template.

## 4. MCP surface (v1)

### 4.1 Tools

| Tool | Purpose |
|------|---------|
| `load_video` | Accept YouTube URL or video ID. Fetch public captions if not cached; write `./.cache/transcripts/<videoId>.json`; set as active video; return title/metadata + short preview + transparency note. |
| `set_position` | Sticky position on active video. Accept `mm:ss`, `h:mm:ss`, or seconds. |
| `get_context` | Transcript window around sticky position (or override timestamp) for “what does this mean?” |
| `ask_at_position` | Question + sticky (or override) position → return grounded segment(s) + timestamps (agent still explains). |
| `find_concept` | Search transcript for a concept → ranked hits with timestamps + short quotes. |
| `get_video_status` | Active video, position, cache hit/miss, caption language, duration. |

### 4.2 Resources

| URI | Purpose |
|-----|---------|
| `transcript://{videoId}` | Full cached transcript (paginate if huge) |
| `transcript://{videoId}/at/{seconds}` | Window around a time |
| `session://current` | Active video + sticky position |

### 4.3 Prompts (nice-to-have in v1)

| Prompt | Purpose |
|--------|---------|
| `tutor_explain` | Explain using only provided segments; always cite timestamps |
| `tutor_find` | Concept-hunt answers that point to rewind times |

### 4.4 Transparency on load

Every successful `load_video` response includes a short clear note, e.g.:

> Fetched this video’s public captions and stored them under `.cache` in this project for tutoring. The video file was not downloaded.

## 5. Transcript fetch + data shape

### 5.1 Fetcher

- Own module; reference prior art, do not vendor their broken scrapers as the core
- **Primary path:** yt-dlp subtitle extraction (manual + auto captions)
- Prefer requested language (default `en`) with clear fallback messaging
- Success → write cache; failure → explicit actionable error

### 5.2 Cache file shape

Path: `.cache/transcripts/<videoId>.json` (gitignored)

```json
{
  "videoId": "...",
  "title": "...",
  "channel": "...",
  "source": "youtube-captions",
  "language": "en",
  "fetchedAt": "...",
  "segments": [
    { "start": 754.2, "duration": 3.1, "text": "..." }
  ]
}
```

`source` distinguishes raw YouTube captions from future `curated-pack` content.

### 5.3 Context window

`get_context` returns approximately ±45–90 seconds around the position (configurable), enough to explain without dumping the full lecture.

### 5.4 Cache location

- **v1 default:** project-local `./.cache` (gitignored)
- Optional later: env override for path
- **Not v1:** shared Supabase / Google Drive CDN of arbitrary YouTube transcripts (redistribution risk; conflicts with “upfront and clear”)

## 6. Session

- File: `.cache/sessions/default.json`
- Fields: `activeVideoId`, `positionSec`, `updatedAt`
- `load_video` sets active video; `set_position` updates sticky time
- Tools that need context fail clearly if no video (or no position, when required) is set

## 7. Errors

Return explicit, actionable messages for:

- No captions available
- yt-dlp missing or failed
- Invalid URL / video ID
- No active video / no position when required
- Cache read/write failures

Never return empty success for a failed transcript fetch.

## 8. Runtime

- **Local first:** mcp-use server + Inspector; configure in Cursor / Claude Desktop
- **Remote later:** same server over HTTP / mcp-use tunnel or deploy
- Cache remains project-local unless explicitly overridden later

## 9. Testing (required)

### 9.1 Unit tests

- Timestamp parsing (`12:34`, `1:02:03`, raw seconds)
- Context window around a position
- Concept search ranking / hit shaping
- Cache read/write and session updates

### 9.2 Transcript integration tests

- Fixture: small known public video with recorded expected segment shape
- Offline CI: mock yt-dlp
- Live (optional / locally gated): real yt-dlp against a stable public captioned video; assert non-empty timed segments

### 9.3 MCP tool tests

- End-to-end tool calls: `load_video` → `set_position` → `get_context` / `find_concept`
- Assert schemas, timestamps, and grounded quotes — not merely “did not throw”

### 9.4 Agent-behavior checks

Scripted scenarios / evals so the tutor *acts* correctly:

| Scenario | Expected tool use | Expected answer traits |
|----------|-------------------|------------------------|
| “I’m at 12:34, what does he mean by attention?” | `set_position` + `get_context` (or equivalent) | Grounded in that window; cites time |
| “I’m confused about backprop” | `find_concept` | Points to timestamp(s); uses transcript quotes |

Fail if the agent answers without tools or skips timestamps.

Start with a manual checklist + a few automated tool-trace tests; grow into a small eval suite.

### 9.5 Transparency checks

- `load_video` always includes the public-captions → `.cache` note

## 10. Roadmap (explicitly out of v1)

### 10.1 Curated courses (planned)

- Curated course packs with **corrected timestamps** and **better / cleaned transcripts** for a higher-quality experience than raw YouTube captions
- Intended to power courses on the author’s website as another client of the same packs
- Future tools (illustrative):
  - `list_courses` — catalog (id, title, author, lesson count)
  - `search_courses` — so “Do you have Andrej Karpathy’s course?” works via the agent
  - `load_course` — activate a curated pack
  - Later: `list_lessons` / `load_lesson` for lesson navigation
- Course pack `source` field: `curated-pack` (distinct from `youtube-captions`)

### 10.2 Guided lessons

Scale from tutor mode into structured walkthroughs (summaries, checkpoints) on top of the same session + transcript primitives.

### 10.3 Optional personal cloud sync

If multi-device cache is needed later: sync **the user’s own** `.cache` to **their** storage — not a global silent transcript warehouse.

### 10.4 Shared / allowlisted cache (only with disclosure)

Only if ever needed: hard allowlist, explicit README disclosure, never silent redistribution of arbitrary YouTube captions.

## 11. Non-goals (v1)

- Downloading video/audio media files
- Depending on the official YouTube Data API for third-party captions (not available for others’ videos)
- Depending on kimtaeyoon83 (or similar) as the production fetcher
- Google Drive as a transcript store
- Building the website course UI in this repo’s v1

## 12. Success criteria (v1)

1. User can load a public captioned lecture (e.g. Karpathy) and get timed segments cached under `.cache`
2. Sticky position + context retrieval works reliably
3. Concept search returns useful timestamped hits
4. Transparency note is always present on load
5. Test suite covers parsing, cache, fetcher (mocked + live script), MCP tools, and at least a few agent-behavior scenarios
6. Server runs locally with mcp-use; remote deploy path documented but not required to ship v1

## 13. Open implementation details (resolved at plan time)

- Exact mcp-use template (`blank` vs `starter`)
- Default context window seconds
- Package/repo name finalization
- Whether `ask_at_position` is a separate tool or folded into `get_context` + prompt
- CI policy for live YouTube tests (default: off in CI, on via explicit script)
