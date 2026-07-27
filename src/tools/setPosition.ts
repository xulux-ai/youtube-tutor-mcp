import { setPosition } from "../session.js";
import { formatTimestamp, parseTimestamp } from "../time.js";
import { getDefaultSessionPath } from "../constants.js";

export async function setPositionHandler(input: {
  timestamp: string | number;
  sessionPath?: string;
}): Promise<{
  videoId: string;
  positionSec: number;
  positionLabel: string;
}> {
  const sessionPath = input.sessionPath ?? getDefaultSessionPath();
  const positionSec = parseTimestamp(input.timestamp);
  const state = await setPosition(positionSec, sessionPath);

  if (!state.activeVideoId) {
    throw new Error("No active video");
  }

  return {
    videoId: state.activeVideoId,
    positionSec,
    positionLabel: formatTimestamp(positionSec),
  };
}
