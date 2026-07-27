import type { TutorScenario } from "../../src/eval/runScenario.js";

/** Offline MCP tutor scenarios (fixture-backed, no network). */
export const offlineScenarios: TutorScenario[] = [
  {
    id: "position-attention-sample",
    user: "I'm at 12:34 — what does he mean by attention?",
    transcriptFixture: "sample-transcript.json",
    videoAlreadyLoaded: true,
    expectTools: ["set-position", "get-context"],
    expectContext: {
      timestamp: "12:34",
      textMatches: /attention/i,
      padSec: 60,
    },
  },
  {
    id: "concept-attention-sample",
    user: 'I\'m confused about the concept of "attention"',
    transcriptFixture: "sample-transcript.json",
    videoAlreadyLoaded: true,
    expectTools: ["find-concept"],
    expectConcept: {
      query: "attention",
      textMatches: /attention/i,
      aroundLabel: "12:30",
    },
  },
  {
    id: "karpathy-intro-position",
    user: "I'm at 0:01 — what is he introducing?",
    transcriptFixture: "karpathy-micrograd-snippet.json",
    videoAlreadyLoaded: true,
    expectTools: ["set-position", "get-context"],
    expectContext: {
      timestamp: "0:01",
      textMatches: /hello my name is andre/i,
      padSec: 45,
    },
  },
  {
    id: "karpathy-derivative-concept",
    user: "I'm confused about the concept of derivative",
    transcriptFixture: "karpathy-micrograd-snippet.json",
    videoAlreadyLoaded: true,
    expectTools: ["find-concept"],
    expectConcept: {
      query: "derivative",
      textMatches: /derivative/i,
      aroundSec: 214, // 3:34
      padSec: 20,
    },
  },
  {
    id: "karpathy-derivative-at-timestamp",
    user: "I'm at 3:34 — what does he mean by derivative here?",
    transcriptFixture: "karpathy-micrograd-snippet.json",
    videoAlreadyLoaded: true,
    expectTools: ["set-position", "get-context"],
    expectContext: {
      timestamp: "3:34",
      textMatches: /derivative/i,
      padSec: 45,
    },
  },
];
