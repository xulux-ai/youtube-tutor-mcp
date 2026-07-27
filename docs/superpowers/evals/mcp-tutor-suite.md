# MCP Tutor Eval Suite

Automated checks that a **correctly connected** agent’s tool use matches the user’s timestamp / concept question, and that tool results are grounded in the transcript.

## What it covers

| Layer | File | What it proves |
|-------|------|----------------|
| Agent policy | `src/eval/agentPolicy.ts` + `tests/mcp-suite/tutor-scenarios.test.ts` | Utterance → expected tools (`set_position`+`get_context`, `find_concept`, …) |
| Grounded tool path | `src/eval/runScenario.ts` + scenarios | Running those tools returns segments/hits that match the asked time or concept |
| Fixtures | `tests/fixtures/sample-transcript.json`, `karpathy-micrograd-snippet.json` | Offline, no YouTube |

## Run

```bash
npm test -- tests/mcp-suite
# or
npm run test:mcp-suite
```

## Adding a scenario

Edit `tests/mcp-suite/scenarios.ts`:

```ts
{
  id: "my-case",
  user: "I'm at 3:34 — what does he mean by derivative?",
  transcriptFixture: "karpathy-micrograd-snippet.json",
  videoAlreadyLoaded: true,
  expectTools: ["set_position", "get_context"],
  expectContext: {
    timestamp: "3:34",
    textMatches: /derivative/i,
    padSec: 45,
  },
}
```

## Not covered yet (follow-ups)

- Full LLM agent loop (mcp-use `MCPAgent` + API key) asserting live tool traces
- Wire-protocol MCP server tests once Task 7 registers real tools on `index.ts`
