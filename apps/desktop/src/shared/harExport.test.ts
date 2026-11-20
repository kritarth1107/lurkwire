import { describe, expect, it } from "vitest";
import { flowsToHar, harToString, statusText } from "./harExport";
import { importHar } from "./workbench/importExport";
import type { FlowDetail } from "./types";
import { PRODUCT_NAME } from "./product";

function flow(partial: Partial<FlowDetail>): FlowDetail {
  return {
    id: "flow-1",
    project_id: "p",
    ts: Date.parse("2026-11-21T04:47:00+05:30"),
    method: "POST",
    scheme: "https",
    host: "httpbin.org",
    port: 443,
    path: "/post",
    query: "x=1",
    url: "https://httpbin.org/post?x=1",
    http_version: "HTTP/1.1",
    status: 200,
    req_len: 9,
    resp_len: 15,
    duration_ms: 42,
    source: "workbench",
    mime: "application/json",
    in_scope: true,
    truncated: false,
    tags: [],
    note: "probe",
    req_headers: [
      { name: "Content-Type", value: "application/json" },
      { name: "Cookie", value: "session=abc" },
    ],
    resp_headers: [
      { name: "Content-Type", value: "application/json" },
      { name: "Set-Cookie", value: "session=abc; Path=/" },
    ],
    req_blob: "hash-req",
    resp_blob: "hash-resp",
    req_preview: '{"z":2}',
    resp_preview: '{"ok":true}',
    ...partial,
  };
}

describe("har export", () => {
  it("writes a HAR 1.2 log that Workbench can import", () => {
    expect(statusText(200)).toBe("OK");
    const har = flowsToHar([
      {
        ...flow({}),
        requestBody: { text: '{"z":2}' },
        responseBody: { text: '{"ok":true}' },
      },
    ]);
    expect(har.log.version).toBe("1.2");
    expect(har.log.creator.name).toBe(PRODUCT_NAME);
    const entry = har.log.entries[0]!;
    expect(entry.request.method).toBe("POST");
    expect(entry.request.url).toBe("https://httpbin.org/post?x=1");
    expect(entry.request.queryString).toEqual([{ name: "x", value: "1" }]);
    expect(entry.request.cookies).toEqual([{ name: "session", value: "abc" }]);
    expect(entry.request.postData).toEqual({ mimeType: "application/json", text: '{"z":2}' });
    expect(entry.response.status).toBe(200);
    expect(entry.response.content.text).toBe('{"ok":true}');
    expect(entry.response.cookies[0]).toMatchObject({ name: "session", value: "abc", path: "/" });
    expect(entry.comment).toContain("probe");
    expect(entry._source).toBe("workbench");
    const imported = importHar(JSON.parse(harToString(har)));
    expect(imported.requests).toHaveLength(1);
    expect(imported.requests[0]?.method).toBe("POST");
    expect(imported.requests[0]?.body.mode).toBe("json");
    expect(imported.requests[0]?.body.json).toContain("z");
  });

  it("marks binary response bodies as base64", () => {
    const har = flowsToHar([
      {
        ...flow({ mime: "application/octet-stream", resp_len: 4 }),
        responseBody: { base64: "AAECAw==" },
      },
    ]);
    expect(har.log.entries[0]?.response.content.encoding).toBe("base64");
    expect(har.log.entries[0]?.response.content.text).toBe("AAECAw==");
  });
});
