import { getContextHandler } from "./getContext.js";
import type { Segment } from "../types.js";

export async function askAtPositionHandler(input: {
  question: string;
  timestamp?: string | number;
  halfWindowSec?: number;
  cacheRoot?: string;
  sessionPath?: string;
}): Promise<{
  videoId: string;
  positionSec: number;
  positionLabel: string;
  startSec: number;
  endSec: number;
  segments: Segment[];
  question: string;
}> {
  const ctx = await getContextHandler(input);
  return {
    ...ctx,
    question: input.question,
  };
}
