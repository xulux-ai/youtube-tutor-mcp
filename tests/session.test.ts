import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadSession,
  setActiveVideo,
  setPosition,
} from "../src/session.js";

describe("session", () => {
  let sessionPath: string;
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-sess-"));
    sessionPath = path.join(dir, "default.json");
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("defaults to empty session", async () => {
    const s = await loadSession(sessionPath);
    expect(s.activeVideoId).toBeNull();
    expect(s.positionSec).toBeNull();
  });

  it("sets active video and position", async () => {
    await setActiveVideo("dQw4w9WgXcQ", sessionPath);
    const s = await setPosition(754, sessionPath);
    expect(s.activeVideoId).toBe("dQw4w9WgXcQ");
    expect(s.positionSec).toBe(754);
  });

  it("throws when setting position without active video", async () => {
    await expect(setPosition(10, sessionPath)).rejects.toThrow(/No active video/);
  });
});
