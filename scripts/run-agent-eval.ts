/**
 * Live LLM ↔ mcp-use MCP agent eval (OpenAI).
 *
 * Starts our MCPServer via mcp-use listen(), connects MCPAgent/MCPClient to
 * http://localhost:PORT/mcp, and asserts toolsUsedNames.
 *
 * Important: on Windows, mcp-use binds to IPv6 localhost (::1). Always use
 * `localhost`, never `127.0.0.1`, in the client URL.
 *
 * Requires OPENAI_API_KEY in .env
 * Usage: npm run test:agent
 */
import "dotenv/config";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ChatOpenAI } from "@langchain/openai";
import { MCPAgent } from "mcp-use/agent";
import { MCPClient } from "mcp-use/client";
import { assertToolTraceContains } from "../src/eval/agentPolicy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

type CaseResult = {
  id: string;
  ok: boolean;
  toolsUsed: string[];
  message: string;
  answerPreview: string;
};

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "Missing OPENAI_API_KEY. Copy .env.example → .env and paste your key.",
    );
    process.exit(1);
  }

  const cacheRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "agent-eval-cache-"),
  );
  const sessionPath = path.join(cacheRoot, "sessions", "default.json");
  process.env.TUTOR_CACHE_ROOT = cacheRoot;
  process.env.TUTOR_SESSION_PATH = sessionPath;

  const { saveTranscript } = await import("../src/cache.js");
  const { setActiveVideo } = await import("../src/session.js");
  const { createTutorServer } = await import(
    "../src/server/createTutorServer.js"
  );

  const fixturePath = path.join(
    root,
    "tests/fixtures/karpathy-micrograd-snippet.json",
  );
  const doc = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  await saveTranscript(doc, cacheRoot);
  await setActiveVideo(doc.videoId, sessionPath);

  const port = 3600 + Math.floor(Math.random() * 200);
  // Prefer localhost (IPv6 ::1 on Windows). Do NOT use 127.0.0.1.
  const mcpUrl = `http://localhost:${port}/mcp`;

  const server = createTutorServer();
  await server.listen(port);

  // Wait until localhost responds
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/`);
      if (res.ok || res.status === 400 || res.status === 404) break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  console.log(`mcp-use server ready at ${mcpUrl}`);
  console.log(`Seeded video ${doc.videoId} (${doc.title})`);

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const llm = new ChatOpenAI({ model, temperature: 0 });
  const client = new MCPClient({
    mcpServers: {
      "youtube-tutor": {
        url: mcpUrl,
      },
    },
  });

  const systemPrompt = `You are a YouTube lecture tutor connected to the youtube-tutor MCP server.
The active video is already loaded (${doc.videoId}).
You MUST use MCP tools before answering:
- Timestamp questions ("I'm at 3:34"): call set-position then get-context (or ask-at-position).
- Concept confusion: call find-concept.
Never invent transcript quotes. Always cite timestamps from tool results. Keep answers short.`;

  const cases: Array<{
    id: string;
    prompt: string;
    expectTools: string[];
  }> = [
    {
      id: "timestamp-derivative",
      prompt:
        "I'm at 3:34 — what does he mean by derivative here? Use MCP tools. Keep the answer short.",
      expectTools: ["set-position", "get-context"],
    },
    {
      id: "concept-derivative",
      prompt:
        'I\'m confused about the concept of "derivative". Use MCP find-concept and point me to a timestamp. Keep it short.',
      expectTools: ["find-concept"],
    },
  ];

  const results: CaseResult[] = [];

  try {
    await client.createAllSessions();

    for (const c of cases) {
      const toolsUsedNames: string[] = [];
      const agent = new MCPAgent({
        llm,
        client,
        maxSteps: 8,
        memoryEnabled: false,
        verbose: true,
        systemPrompt,
        toolsUsedNames,
      });

      let answer = "";
      try {
        answer = await agent.run({ prompt: c.prompt, maxSteps: 8 });
      } catch (err) {
        results.push({
          id: c.id,
          ok: false,
          toolsUsed: [...(agent.toolsUsedNames?.length ? agent.toolsUsedNames : toolsUsedNames)],
          message: `agent error: ${err instanceof Error ? err.message : String(err)}`,
          answerPreview: "",
        });
        await agent.close().catch(() => undefined);
        continue;
      }

      const used =
        (agent.toolsUsedNames?.length ? agent.toolsUsedNames : toolsUsedNames) ??
        [];
      const check = assertToolTraceContains(used, c.expectTools);
      let ok = check.ok;
      let message = check.message;
      if (
        !ok &&
        c.expectTools.includes("get-context") &&
        used.includes("set-position") &&
        (used.includes("ask-at-position") || used.includes("get-context"))
      ) {
        ok = true;
        message = `accepted tool variant: ${used.join(" → ")}`;
      }

      results.push({
        id: c.id,
        ok,
        toolsUsed: used,
        message,
        answerPreview: answer.slice(0, 280),
      });
      await agent.close().catch(() => undefined);
    }
  } finally {
    await client.closeAllSessions().catch(() => undefined);
    await fs.rm(cacheRoot, { recursive: true, force: true }).catch(() => undefined);
  }

  console.log("\n=== mcp-use agent eval results ===");
  for (const r of results) {
    console.log(
      `${r.ok ? "PASS" : "FAIL"} ${r.id}\n  tools: ${r.toolsUsed.join(" → ") || "(none)"}\n  ${r.message}\n  answer: ${r.answerPreview.replace(/\n/g, " ")}\n`,
    );
  }

  if (results.some((r) => !r.ok)) process.exit(1);
  console.log("All mcp-use agent eval cases passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
