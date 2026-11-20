import { describe, expect, it } from "vitest";
import { PROJECT_COLORS, projectColor } from "./projectColor";

describe("projectColor", () => {
  it("is stable for a given id", () => {
    expect(projectColor("abc")).toBe(projectColor("abc"));
  });

  it("picks from the container palette", () => {
    expect(PROJECT_COLORS).toContain(projectColor("project-1"));
  });

  it("spreads different ids", () => {
    const colors = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(projectColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});
