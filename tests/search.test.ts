import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { parseVtt } from "../src/transcript/vtt.js";
import { findConcept } from "../src/transcript/search.js";

describe("findConcept", () => {
  let segments: Awaited<ReturnType<typeof parseVtt>>;

  beforeAll(async () => {
    const fixturePath = path.join(
      import.meta.dirname,
      "fixtures",
      "sample.en.vtt",
    );
    const contents = await fs.readFile(fixturePath, "utf8");
    segments = parseVtt(contents);
  });

  it("finds attention with formatted timestamp", () => {
    const hits = findConcept(segments, "attention");

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].timestamp).toBe("12:30");
    expect(hits[0].quote).toContain("Attention");
  });

  it("finds backprop via substring match", () => {
    const hits = findConcept(segments, "backprop");

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].quote).toMatch(/backpropagation/i);
  });
});
