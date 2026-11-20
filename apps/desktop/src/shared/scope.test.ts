import { describe, expect, test } from "vitest";
import { activeAllowed, hostMatches, isPassivelyInScope } from "./scope";
import type { ScopeRule } from "./types";

function rule(kind: "include" | "exclude", host: string, path = "/", port: number | null = null): ScopeRule {
  return { id: "r", project_id: "p", enabled: true, kind, host, port, path_prefix: path, created_at: 0 };
}

describe("scope", () => {
  test("wildcard hosts", () => {
    expect(hostMatches("*.example.com", "a.example.com")).toBe(true);
    expect(hostMatches("*.example.com", "example.com")).toBe(true);
    expect(hostMatches("example.com", "other.com")).toBe(false);
  });

  test("passive defaults to allow when no includes exist", () => {
    expect(isPassivelyInScope([], "httpbin.org", 443, "/get")).toBe(true);
  });

  test("active tools are default-deny", () => {
    expect(activeAllowed([], "httpbin.org", 443, "/get")).toBe(false);
    expect(activeAllowed([rule("include", "httpbin.org")], "httpbin.org", 443, "/get")).toBe(true);
    expect(activeAllowed([rule("include", "httpbin.org"), rule("exclude", "httpbin.org", "/deny")], "httpbin.org", 443, "/deny/x")).toBe(false);
  });
});
