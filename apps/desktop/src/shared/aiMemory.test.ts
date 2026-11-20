import { describe, expect, it } from "vitest";
import { clip, formatMemoryPrompt, type AiMemoryEntry } from "./aiMemory";

describe("ai memory", () => {
  it("clips long text with an ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("abcdefghijk", 8)).toBe("abcdefgh…");
  });

  it("formats the most recent turns into a prompt block", () => {
    const entries: AiMemoryEntry[] = [
      { id: "1", action: "explain", ts: 1, input: "first", output: "one", model: "m", provider: "ollama" },
      { id: "2", action: "explain", ts: 2, input: "second", output: "two", model: "m", provider: "ollama" },
    ];
    const prompt = formatMemoryPrompt(entries);
    expect(prompt).toContain("local notes");
    expect(prompt).toContain("User: first");
    expect(prompt).toContain("Assistant: two");
  });
});
