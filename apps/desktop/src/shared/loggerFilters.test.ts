import { expect, test } from "vitest";
import type { FlowSummary } from "./types";
import { EMPTY_FILTER, flowMatchesFilter, highlightForFlow } from "./loggerFilters";

function flow(patch: Partial<FlowSummary>): FlowSummary {
  return {
    id: "1",
    project_id: "p",
    ts: 0,
    method: "GET",
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/login",
    query: "",
    url: "https://example.com/login",
    http_version: "1.1",
    status: 200,
    req_len: 0,
    resp_len: 0,
    duration_ms: 1,
    source: "proxy",
    mime: "text/html",
    in_scope: true,
    truncated: false,
    tags: [],
    note: "",
    ...patch,
  };
}

test("filters by method, status class, and regex query", () => {
  expect(flowMatchesFilter(flow({}), { ...EMPTY_FILTER, method: "POST" })).toBe(false);
  expect(flowMatchesFilter(flow({ status: 500 }), { ...EMPTY_FILTER, status: "5xx" })).toBe(true);
  expect(flowMatchesFilter(flow({ path: "/admin" }), { ...EMPTY_FILTER, query: "/admin|login/" })).toBe(true);
});

test("applies highlight rules when no tag is set", () => {
  const color = highlightForFlow(flow({ path: "/admin" }), [{ id: "1", pattern: "admin", color: "red", enabled: true }]);
  expect(color).toBe("red");
});
