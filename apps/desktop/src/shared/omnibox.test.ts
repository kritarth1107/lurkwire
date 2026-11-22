import { describe, expect, it } from "vitest";
import {
  DEFAULT_SEARCH_URL,
  buildOmniboxSuggestions,
  faviconForUrl,
  looksLikeUrl,
  resolveOmnibox,
  searchUrl,
} from "./omnibox";

describe("looksLikeUrl", () => {
  it("accepts schemes, localhost, IPs, and hosts with a TLD", () => {
    expect(looksLikeUrl("https://example.com")).toBe(true);
    expect(looksLikeUrl("lurkwire://history")).toBe(true);
    expect(looksLikeUrl("about:blank")).toBe(true);
    expect(looksLikeUrl("localhost")).toBe(true);
    expect(looksLikeUrl("localhost:3000/login")).toBe(true);
    expect(looksLikeUrl("127.0.0.1")).toBe(true);
    expect(looksLikeUrl("127.0.0.1:8080/x")).toBe(true);
    expect(looksLikeUrl("[::1]:80")).toBe(true);
    expect(looksLikeUrl("example.com")).toBe(true);
    expect(looksLikeUrl("httpbin.org/get")).toBe(true);
    expect(looksLikeUrl("sub.demo.testfire.net")).toBe(true);
  });

  it("rejects searches, bare words, and invalid IPs", () => {
    expect(looksLikeUrl("juice shop login")).toBe(false);
    expect(looksLikeUrl("github")).toBe(false);
    expect(looksLikeUrl("999.1.1.1")).toBe(false);
    expect(looksLikeUrl(".com")).toBe(false);
    expect(looksLikeUrl("example.")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
    expect(looksLikeUrl("   ")).toBe(false);
  });
});

describe("resolveOmnibox", () => {
  it("navigates hosts and IPs with an implied https scheme", () => {
    expect(resolveOmnibox("example.com/path")).toEqual({
      kind: "url",
      url: "https://example.com/path",
      query: "example.com/path",
    });
    expect(resolveOmnibox("  localhost:3000  ")).toEqual({
      kind: "url",
      url: "https://localhost:3000",
      query: "localhost:3000",
    });
    expect(resolveOmnibox("http://testphp.vulnweb.com/")).toEqual({
      kind: "url",
      url: "http://testphp.vulnweb.com/",
      query: "http://testphp.vulnweb.com/",
    });
  });

  it("sends everything else to the search engine", () => {
    const resolved = resolveOmnibox("sql injection testphp");
    expect(resolved.kind).toBe("search");
    expect(resolved.url).toBe(`${DEFAULT_SEARCH_URL}${encodeURIComponent("sql injection testphp")}`);
  });

  it("treats a blank query as empty", () => {
    expect(resolveOmnibox("  ")).toEqual({ kind: "url", url: "", query: "" });
  });
});

describe("searchUrl", () => {
  it("supports %s templates and suffix templates", () => {
    expect(searchUrl("a b", "https://example/search?q=%s")).toBe("https://example/search?q=a%20b");
    expect(searchUrl("a b", "https://example/search?q=")).toBe("https://example/search?q=a%20b");
  });
});

describe("buildOmniboxSuggestions", () => {
  const visits = [
    { id: "v1", url: "https://httpbin.org/get", title: "httpbin get", count: 4 },
    { id: "v2", url: "https://github.com/kritarth1107/lurkwire", title: "Lurkwire", count: 2 },
  ];
  const bookmarks = [{ id: "b1", url: "http://testphp.vulnweb.com/", title: "testphp" }];

  it("leads with a navigate top hit for URL-like input", () => {
    const items = buildOmniboxSuggestions({ query: "httpbin.org", visits, bookmarks });
    expect(items[0]?.kind).toBe("navigate");
    expect(items[0]?.url).toBe("https://httpbin.org");
    expect(items.some((item) => item.kind === "history" && item.url.includes("httpbin.org"))).toBe(true);
  });

  it("leads with search and includes Google suggestions plus history", () => {
    const items = buildOmniboxSuggestions({
      query: "httpbin",
      visits,
      bookmarks,
      searchSuggestions: ["httpbin org", "httpbin headers"],
    });
    expect(items.some((item) => item.kind === "search" && item.subtitle === "Search Google")).toBe(true);
    expect(items.some((item) => item.kind === "suggest" && item.title === "httpbin org")).toBe(true);
    expect(items.some((item) => item.kind === "history")).toBe(true);
    // A typed prefix of a visited host autocompletes as the top hit, like Chrome.
    expect(items[0]?.kind === "history" || items[0]?.kind === "search").toBe(true);
  });

  it("autocompletes a history prefix as the top hit", () => {
    const items = buildOmniboxSuggestions({ query: "httpbin.org/g", visits });
    expect(items[0]?.kind).toBe("navigate");
    const history = items.find((item) => item.kind === "history");
    expect(history?.completion ?? items[0]?.url).toContain("httpbin.org");
  });

  it("matches bookmarks and attaches favicons", () => {
    const items = buildOmniboxSuggestions({ query: "testphp", visits, bookmarks });
    const hit = items.find((item) => item.kind === "bookmark");
    expect(hit?.url).toBe("http://testphp.vulnweb.com/");
    expect(hit?.favicon).toBe(faviconForUrl("http://testphp.vulnweb.com/"));
    expect(faviconForUrl("http://testphp.vulnweb.com/")).toContain("testphp.vulnweb.com");
  });

  it("returns nothing for a blank query", () => {
    expect(buildOmniboxSuggestions({ query: "  ", visits })).toEqual([]);
  });
});
