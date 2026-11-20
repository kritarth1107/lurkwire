import { describe, expect, it } from "vitest";
import { lineDiff } from "./diff";

describe("lineDiff", () => {
  it("marks inserted and deleted lines", () => {
    const lines = lineDiff("a\nb\nc", "a\nx\nc");
    expect(lines).toEqual([
      { kind: "eq", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "x" },
      { kind: "eq", text: "c" },
    ]);
  });
});
