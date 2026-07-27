import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runTutorScenario } from "../../src/eval/runScenario.js";
import {
  planToolsForUtterance,
  assertToolTraceContains,
} from "../../src/eval/agentPolicy.js";
import { offlineScenarios } from "./scenarios.js";

describe("MCP tutor suite — agent policy", () => {
  it("maps sticky-position questions to set-position + get-context", () => {
    const plan = planToolsForUtterance(
      "I'm at 12:34, what does he mean by attention?",
      { videoAlreadyLoaded: true },
    );
    const names = plan.tools.map((t) => t.name);
    const check = assertToolTraceContains(names, [
      "set-position",
      "get-context",
    ]);
    expect(check.ok, check.message).toBe(true);
  });

  it("maps concept confusion to find-concept", () => {
    const plan = planToolsForUtterance(
      'I\'m confused about the concept of "backprop"',
      { videoAlreadyLoaded: true },
    );
    const names = plan.tools.map((t) => t.name);
    const check = assertToolTraceContains(names, ["find-concept"]);
    expect(check.ok, check.message).toBe(true);
    expect(plan.tools[0]).toMatchObject({
      name: "find-concept",
      args: { query: "backprop" },
    });
  });

  it("maps load + timestamp when URL present", () => {
    const plan = planToolsForUtterance(
      "Load https://www.youtube.com/watch?v=VMj-3S1tku0 then I'm at 0:01 what is this?",
      { videoAlreadyLoaded: false },
    );
    const names = plan.tools.map((t) => t.name);
    const check = assertToolTraceContains(names, [
      "load-video",
      "set-position",
      "get-context",
    ]);
    expect(check.ok, check.message).toBe(true);
  });
});

describe("MCP tutor suite — grounded tool path", () => {
  let cacheRoot: string;
  let sessionPath: string;
  const fixturesDir = path.join(import.meta.dirname, "..", "fixtures");

  beforeEach(async () => {
    cacheRoot = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-suite-cache-"));
    const sessionDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "mcp-suite-sess-"),
    );
    sessionPath = path.join(sessionDir, "default.json");
  });

  afterEach(async () => {
    await fs.rm(cacheRoot, { recursive: true, force: true });
    await fs.rm(path.dirname(sessionPath), { recursive: true, force: true });
  });

  for (const scenario of offlineScenarios) {
    it(`${scenario.id}: ${scenario.user}`, async () => {
      const result = await runTutorScenario(scenario, {
        cacheRoot,
        sessionPath,
        fixturesDir,
      });
      expect(result.policyOk, result.policyMessage).toBe(true);
      expect(result.groundingOk, result.groundingMessage).toBe(true);
    });
  }
});
