import { describe, expect, it } from "vitest";
import { isNewTabUrl, isSettingsUrl, normalizeUrl } from "./url";

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

describe("internal pages", () => {
  it("recognizes the start page", () => {
    expect(isNewTabUrl("")).toBe(true);
    expect(isNewTabUrl("about:blank")).toBe(true);
    expect(isNewTabUrl("lurkwire://newtab")).toBe(true);
    expect(isNewTabUrl("https://example.com")).toBe(false);
  });

  it("recognizes settings", () => {
    expect(isSettingsUrl("lurkwire://settings")).toBe(true);
    expect(isSettingsUrl("about:preferences")).toBe(true);
    expect(isSettingsUrl("https://example.com")).toBe(false);
  });
});
