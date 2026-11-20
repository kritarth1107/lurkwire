import { describe, expect, it } from "vitest";
import {
  canonicalizeInternalUrl,
  isInternalUrl,
  isNewTabUrl,
  isSettingsUrl,
  normalizeUrl,
  parseInternalPage,
  titleForInternalPage,
} from "./url";

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

  it("canonicalizes about:preferences to lurkwire://settings", () => {
    expect(normalizeUrl("about:preferences")).toBe("lurkwire://settings");
  });
});

describe("internal pages", () => {
  it("recognizes the start page", () => {
    expect(isNewTabUrl("")).toBe(true);
    expect(isNewTabUrl("about:blank")).toBe(true);
    expect(isNewTabUrl("lurkwire://newtab")).toBe(true);
    expect(isNewTabUrl("https://example.com")).toBe(false);
  });

  it("recognizes settings aliases", () => {
    expect(isSettingsUrl("lurkwire://settings")).toBe(true);
    expect(isSettingsUrl("about:preferences")).toBe(true);
    expect(isSettingsUrl("https://example.com")).toBe(false);
  });

  it("parses every lurkwire:// host", () => {
    expect(parseInternalPage("lurkwire://downloads")).toBe("downloads");
    expect(parseInternalPage("lurkwire://history#today")).toBe("history");
    expect(parseInternalPage("lurkwire://bookmarks/")).toBe("bookmarks");
    expect(parseInternalPage("lurkwire://extensions")).toBe("extensions");
    expect(parseInternalPage("lurkwire://workbench")).toBe("workbench");
    expect(parseInternalPage("lurkwire://api")).toBe("workbench");
    expect(parseInternalPage("lurkwire://about")).toBe("about");
    expect(titleForInternalPage("lurkwire://workbench")).toBe("Workbench");
    expect(parseInternalPage("chrome://extensions")).toBe("extensions");
    expect(parseInternalPage("lurkwire://unknown")).toBeNull();
  });

  it("canonicalizes aliases and keeps settings hashes", () => {
    expect(canonicalizeInternalUrl("about:downloads")).toBe("lurkwire://downloads");
    expect(canonicalizeInternalUrl("lurkwire://settings#privacy")).toBe("lurkwire://settings#privacy");
    expect(titleForInternalPage("lurkwire://extensions")).toBe("Extensions");
    expect(isInternalUrl("lurkwire://about")).toBe(true);
    expect(isInternalUrl("https://example.com")).toBe(false);
  });
});
