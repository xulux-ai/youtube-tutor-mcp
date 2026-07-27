import fs from "node:fs/promises";
import path from "node:path";
import { saveTranscript } from "../cache.js";
import { setActiveVideo } from "../session.js";
import type { TranscriptDoc } from "../types.js";
import { setPositionHandler } from "../tools/setPosition.js";
import { getContextHandler } from "../tools/getContext.js";
import { findConceptHandler } from "../tools/findConcept.js";
import { askAtPositionHandler } from "../tools/askAtPosition.js";
import { planToolsForUtterance, type ExpectedTool } from "./agentPolicy.js";

export type TutorScenario = {
  id: string;
  /** What the user says to the MCP-connected agent. */
  user: string;
  /** If set, seed this transcript into cache as the active video. */
  transcriptFixture?: string;
  /** Video already loaded before the utterance. */
  videoAlreadyLoaded?: boolean;
  /** Expected tool names in order (subsequence). */
  expectTools: string[];
  /**
   * If the scenario is a timestamp Q&A, run the golden tool path and
   * assert context segments overlap this time and match the regex.
   */
  expectContext?: {
    timestamp: string;
    textMatches: RegExp;
    /** Segment starts must fall within [timestampSec - pad, timestampSec + pad] for at least one match. */
    padSec?: number;
  };
  /** If concept search, assert a hit near expected time. */
  expectConcept?: {
    query: string;
    textMatches: RegExp;
    /** Hit timestamp label like "3:34" or start within ±pad of this seconds value. */
    aroundSec?: number;
    aroundLabel?: string;
    padSec?: number;
  };
};

export type ScenarioResult = {
  id: string;
  user: string;
  planTools: string[];
  policyOk: boolean;
  policyMessage: string;
  groundingOk: boolean;
  groundingMessage: string;
  evidence?: unknown;
};

function toolNames(tools: ExpectedTool[]): string[] {
  return tools.map((t) => t.name);
}

function planContains(actual: string[], expected: string[]): boolean {
  let i = 0;
  for (const name of actual) {
    if (name === expected[i]) i += 1;
    if (i === expected.length) return true;
  }
  return false;
}

export async function seedTranscriptFixture(
  fixturePath: string,
  cacheRoot: string,
  sessionPath: string,
): Promise<TranscriptDoc> {
  const raw = await fs.readFile(fixturePath, "utf8");
  const doc = JSON.parse(raw) as TranscriptDoc;
  await saveTranscript(doc, cacheRoot);
  await setActiveVideo(doc.videoId, sessionPath);
  return doc;
}

/**
 * Run one tutor scenario:
 * 1) Check agent policy (which tools the utterance should trigger)
 * 2) Execute the golden MCP tool path and verify transcript grounding
 */
export async function runTutorScenario(
  scenario: TutorScenario,
  opts: { cacheRoot: string; sessionPath: string; fixturesDir: string },
): Promise<ScenarioResult> {
  if (scenario.transcriptFixture) {
    const fixturePath = path.join(opts.fixturesDir, scenario.transcriptFixture);
    await seedTranscriptFixture(
      fixturePath,
      opts.cacheRoot,
      opts.sessionPath,
    );
  }

  const plan = planToolsForUtterance(scenario.user, {
    videoAlreadyLoaded: scenario.videoAlreadyLoaded ?? true,
  });
  const planTools = toolNames(plan.tools);
  const policyOk = planContains(planTools, scenario.expectTools);
  const policyMessage = policyOk
    ? `policy ok: ${planTools.join(" → ")}`
    : `policy miss: expected [${scenario.expectTools.join(" → ")}], planned [${planTools.join(" → ")}]`;

  let groundingOk = true;
  let groundingMessage = "no grounding checks";
  let evidence: unknown;

  if (scenario.expectContext) {
    await setPositionHandler({
      timestamp: scenario.expectContext.timestamp,
      sessionPath: opts.sessionPath,
    });
    const ctx = await getContextHandler({
      cacheRoot: opts.cacheRoot,
      sessionPath: opts.sessionPath,
      halfWindowSec: scenario.expectContext.padSec ?? 60,
    });
    const matched = ctx.segments.filter((s) =>
      scenario.expectContext!.textMatches.test(s.text),
    );
    groundingOk = matched.length > 0;
    groundingMessage = groundingOk
      ? `context at ${ctx.positionLabel} contains ${matched.length} matching segment(s)`
      : `context at ${ctx.positionLabel} missing text /${scenario.expectContext.textMatches}/`;
    evidence = {
      positionSec: ctx.positionSec,
      segmentCount: ctx.segments.length,
      matched: matched.slice(0, 3),
    };

    // Also exercise ask_at_position for positioned questions
    const asked = await askAtPositionHandler({
      question: scenario.user,
      cacheRoot: opts.cacheRoot,
      sessionPath: opts.sessionPath,
    });
    if (!asked.segments.some((s) => scenario.expectContext!.textMatches.test(s.text))) {
      groundingOk = false;
      groundingMessage += "; ask_at_position also missed match";
    }
  }

  if (scenario.expectConcept) {
    const found = await findConceptHandler({
      query: scenario.expectConcept.query,
      limit: 8,
      cacheRoot: opts.cacheRoot,
      sessionPath: opts.sessionPath,
    });
    const pad = scenario.expectConcept.padSec ?? 30;
    const matched = found.hits.filter((h) => {
      if (!scenario.expectConcept!.textMatches.test(h.quote)) return false;
      if (scenario.expectConcept!.aroundLabel) {
        return h.timestamp === scenario.expectConcept!.aroundLabel;
      }
      if (scenario.expectConcept!.aroundSec != null) {
        return Math.abs(h.start - scenario.expectConcept!.aroundSec) <= pad;
      }
      return true;
    });
    groundingOk = matched.length > 0;
    groundingMessage = groundingOk
      ? `find_concept hit ${matched[0]?.timestamp}: "${matched[0]?.quote.slice(0, 80)}"`
      : `find_concept missed expected grounding for "${scenario.expectConcept.query}"`;
    evidence = { hits: found.hits.slice(0, 5), matched: matched.slice(0, 3) };
  }

  return {
    id: scenario.id,
    user: scenario.user,
    planTools,
    policyOk,
    policyMessage,
    groundingOk,
    groundingMessage,
    evidence,
  };
}
