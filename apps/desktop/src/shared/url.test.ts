import { describe, expect, it } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
  });

  it("keeps an explicit scheme", () => {
    expect(normalizeUrl("http://localhost:3000/")).toBe("http://localhost:3000/");
  });

  it("trims whitespace and ignores blanks", () => {
    expect(normalizeUrl("  ")).toBe("");
  });
});
