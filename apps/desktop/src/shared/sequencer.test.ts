import { describe, expect, it } from "vitest";
import { analyzeTokens, shannonEntropy } from "./sequencer";

describe("sequencer", () => {
  it("flags incremental numeric tokens as predictable", () => {
    const stats = analyzeTokens("100\n101\n102\n103");
    expect(stats.count).toBe(4);
    expect(stats.unique).toBe(4);
    expect(stats.numeric).toBe(true);
    expect(stats.incremental).toBe(true);
  });

  it("computes zero entropy for identical samples", () => {
    expect(shannonEntropy(["aaa", "aaa"])).toBe(0);
    const stats = analyzeTokens("aaa\naaa");
    expect(stats.unique).toBe(1);
    expect(stats.notes[0]).toMatch(/identical/);
  });
});
