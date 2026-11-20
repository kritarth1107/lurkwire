import { describe, expect, it } from "vitest";
import { generateSnippet, SNIPPET_LANGUAGES } from "./snippets";
import { emptyBody } from "./types";
import { kv } from "./kv";
import type { WbRequest } from "./types";

const sample: Pick<WbRequest, "method" | "url" | "params" | "headers" | "body" | "auth"> = {
  method: "POST",
  url: "https://httpbin.org/post",
  params: [kv("source", "lw")],
  headers: [kv("X-Test", "1")],
  body: { ...emptyBody(), mode: "json", json: '{"hello":"world"}' },
  auth: { type: "bearer", bearer: { token: "tok" } },
};

describe("generateSnippet", () => {
  it("emits a snippet for every supported language", () => {
    for (const language of SNIPPET_LANGUAGES) {
      const text = generateSnippet(language, sample);
      expect(text.length).toBeGreaterThan(20);
      expect(text).toContain("httpbin.org/post");
    }
  });

  it("includes method, auth header, and JSON body in fetch and python", () => {
    const fetch = generateSnippet("fetch", sample);
    expect(fetch).toContain('method: "POST"');
    expect(fetch).toContain("Bearer tok");
    expect(fetch).toContain("hello");
    const py = generateSnippet("python", sample);
    expect(py).toContain("import requests");
    expect(py).toContain('"hello":"world"');
  });
});
