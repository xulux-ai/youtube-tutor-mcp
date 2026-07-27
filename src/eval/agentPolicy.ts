/**
 * Deterministic mapping from a user utterance → expected MCP tool plan.
 * Used by the MCP eval suite to check that a correctly-connected agent
 * would call the right tools for timestamp / concept questions.
 */

export type ExpectedTool =
  | { name: "load_video"; args?: Record<string, unknown> }
  | { name: "set_position"; args: { timestamp: string } }
  | { name: "get_context"; args?: { timestamp?: string } }
  | { name: "ask_at_position"; args: { question: string; timestamp?: string } }
  | { name: "find_concept"; args: { query: string } }
  | { name: "get_video_status"; args?: Record<string, unknown> };

export type AgentPlan = {
  /** Tools the agent should call, in order (after optional load_video). */
  tools: ExpectedTool[];
  /** True if the utterance implies a video must already be loaded or loaded first. */
  requiresVideo: boolean;
};

const POSITION_RE =
  /\b(?:i'?m\s+at|at|timestamp|time)\s+(\d{1,2}:\d{2}(?::\d{2})?|\d+)\b/i;
const CONFUSED_RE =
  /\b(?:confused about|what(?:'s| is) .+ mean|explain|don'?t understand)\b/i;
const CONCEPT_CAPTURE_RE =
  /(?:confused about|explain|don'?t understand)\s+(?:the\s+)?(?:concept\s+of\s+)?["“]?([^"”?.!]+)["”]?/i;

/**
 * Infer the expected tool plan for a tutor utterance.
 * This is intentionally conservative — used for evals, not shipped as production routing.
 */
export function planToolsForUtterance(
  utterance: string,
  opts: { videoAlreadyLoaded?: boolean } = {},
): AgentPlan {
  const text = utterance.trim();
  const tools: ExpectedTool[] = [];
  const videoAlreadyLoaded = opts.videoAlreadyLoaded ?? false;

  const urlMatch = text.match(
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i,
  );
  const bareId = text.match(/\b([a-zA-Z0-9_-]{11})\b/);
  if (urlMatch || (!videoAlreadyLoaded && /load|watch|video/i.test(text) && bareId)) {
    tools.push({
      name: "load_video",
      args: urlMatch
        ? { url: urlMatch[0] }
        : bareId
          ? { url: bareId[1] }
          : undefined,
    });
  }

  const pos = text.match(POSITION_RE);
  if (pos?.[1]) {
    tools.push({ name: "set_position", args: { timestamp: pos[1] } });
    // Positioned questions should pull grounded context
    if (/\?|what|mean|explain|why|how/i.test(text)) {
      tools.push({ name: "get_context" });
    }
  }

  const concept = text.match(CONCEPT_CAPTURE_RE);
  if (concept?.[1] && !pos) {
    tools.push({
      name: "find_concept",
      args: { query: concept[1].trim() },
    });
  } else if (CONFUSED_RE.test(text) && !pos && !concept) {
    // Fallback: treat quoted term or last noun-ish phrase as query later in evals
    const quoted = text.match(/["“]([^"”]+)["”]/);
    if (quoted?.[1]) {
      tools.push({ name: "find_concept", args: { query: quoted[1].trim() } });
    }
  }

  return {
    tools,
    requiresVideo: true,
  };
}

/** Assert a recorded tool-call trace contains the expected names in order (extras allowed). */
export function assertToolTraceContains(
  actualNames: string[],
  expectedNames: string[],
): { ok: boolean; message: string } {
  let i = 0;
  for (const name of actualNames) {
    if (name === expectedNames[i]) i += 1;
    if (i === expectedNames.length) {
      return { ok: true, message: "trace matches expected tool sequence" };
    }
  }
  return {
    ok: false,
    message: `expected tools [${expectedNames.join(" → ")}] in order; got [${actualNames.join(" → ")}]`,
  };
}
