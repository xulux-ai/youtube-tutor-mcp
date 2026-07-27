# MCP Tutor Eval Suite

Automated checks that a **correctly connected** agent’s tool use matches the user’s timestamp / concept question, and that tool results are grounded in the transcript.

## What it covers

| Layer | File | What it proves |
|-------|------|----------------|
| Agent policy | `src/eval/agentPolicy.ts` + `tests/mcp-suite/tutor-scenarios.test.ts` | Utterance → expected tools |
| Grounded tool path | `src/eval/runScenario.ts` + scenarios | Tools return the right transcript window/hits |
| **mcp-use agent loop** | `scripts/run-agent-eval.ts` | Real `MCPAgent` → `MCPClient` → `http://localhost:PORT/mcp` tool traces |

## Deterministic suite

```bash
npm run test:mcp-suite
```

## Live mcp-use + OpenAI agent loop

```bash
cp .env.example .env   # set OPENAI_API_KEY
npm run test:agent
```

Flow:
1. Seed Karpathy fixture into a temp cache
2. `createTutorServer().listen(port)` (mcp-use)
3. `MCPClient` connects to `http://localhost:PORT/mcp`
4. `MCPAgent` runs cases; assert `toolsUsedNames`

**Windows note:** use `localhost`, not `127.0.0.1` — mcp-use binds IPv6 `::1`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | yes | OpenAI key for MCPAgent |
| `OPENAI_MODEL` | no | Default `gpt-4o-mini` |
| `ANTHROPIC_API_KEY` | no | Reserved for Anthropic later |

## Inspector (mcp-use)

```bash
npm run dev
# http://localhost:3000/inspector
```
