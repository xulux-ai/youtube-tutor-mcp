# youtube-tutor-mcp

MCP server that loads YouTube videos, fetches public captions, and exposes tutor tools for transcript context and concept search.

## Prerequisites

- Node.js 22+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) on `PATH` (required for live caption fetching; never downloads video media — always uses `--skip-download`)

Install yt-dlp (examples):

```bash
# Windows (winget)
winget install yt-dlp.yt-dlp

# macOS (Homebrew)
brew install yt-dlp

# pip
pip install -U yt-dlp
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Unit tests (mocked yt-dlp; no binary required) |
| `npm run test:live` | Live yt-dlp test (`LIVE_YOUTUBE=1`); requires yt-dlp on PATH |
| `npm run live-check` | Fetch captions for one video and print segment count |

```bash
npm run test:live
npm run live-check
npm run live-check -- jNQXAC9IVRw
```
