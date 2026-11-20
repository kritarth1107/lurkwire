import { describe, expect, it } from "vitest";
import { sitemapToMarkdown } from "./sitemapExport";
import type { FlowSummary } from "./types";

function item(partial: Partial<FlowSummary>): FlowSummary {
  return {
    id: "1",
    project_id: "p",
    ts: 1,
    method: "GET",
    scheme: "https",
    host: "httpbin.org",
    port: 443,
    path: "/get",
    query: "",
    url: "https://httpbin.org/get",
    http_version: "HTTP/1.1",
    status: 200,
    req_len: 0,
    resp_len: 0,
    duration_ms: 1,
    source: "proxy",
    mime: "application/json",
    in_scope: true,
    truncated: false,
    tags: [],
    note: "",
    ...partial,
  };
}

describe("sitemap markdown", () => {
  it("groups unique methods and paths under each host", () => {
    const md = sitemapToMarkdown([
      item({ id: "1", path: "/get", url: "https://httpbin.org/get" }),
      item({ id: "2", path: "/get", url: "https://httpbin.org/get" }),
      item({ id: "3", method: "POST", path: "/post", url: "https://httpbin.org/post", status: 200 }),
      item({ id: "4", host: "example.com", path: "/", url: "https://example.com/", status: 200 }),
    ]);
    expect(md).toContain("## example.com (1)");
    expect(md).toContain("## httpbin.org (2)");
    expect(md).toContain("- GET /get (200)");
    expect(md).toContain("- POST /post (200)");
    expect(md.match(/GET \/get/g)?.length).toBe(1);
  });
});
