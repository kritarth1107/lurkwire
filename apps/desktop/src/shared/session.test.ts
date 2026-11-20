import { describe, expect, it } from "vitest";
import { hasRestorableTabs, type SessionState } from "./session";

describe("session restore", () => {
  it("detects whether a saved session has tabs to reopen", () => {
    expect(hasRestorableTabs({ windows: [] })).toBe(false);
    expect(hasRestorableTabs({ windows: [{ tabs: [], groups: [], activeUrl: null }] })).toBe(false);
    const session: SessionState = {
      windows: [
        {
          tabs: [{ url: "https://example.com", title: "Example", pinned: false, groupId: "g1" }],
          groups: [{ id: "g1", title: "Work", color: "blue", collapsed: true }],
          activeUrl: "https://example.com",
        },
      ],
    };
    expect(hasRestorableTabs(session)).toBe(true);
  });
});
