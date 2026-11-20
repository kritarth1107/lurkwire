import { describe, expect, it } from "vitest";
import { parseCurl, toCurl, tokenizeCurl } from "./curl";
import { emptyAuth, emptyBody } from "./types";
import { kv } from "./kv";

describe("tokenizeCurl", () => {
  it("respects quotes and line continuations", () => {
    expect(tokenizeCurl("curl -H 'X-A: 1' \\\n  https://example.com")).toEqual([
      "curl",
      "-H",
      "X-A: 1",
      "https://example.com",
    ]);
  });
});

describe("parseCurl", () => {
  it("parses a typical POST with headers, JSON, and bearer auth", () => {
    const parsed = parseCurl(`
      curl -X POST 'https://httpbin.org/post?source=lw' \\
        -H 'Authorization: Bearer secret-token' \\
        -H 'Content-Type: application/json' \\
        --data-raw '{"hello":"world"}'
    `);
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://httpbin.org/post?source=lw");
    expect(parsed.headers.map((h) => `${h.key}: ${h.value}`)).toContain("Authorization: Bearer secret-token");
    expect(parsed.body.mode).toBe("json");
    expect(parsed.body.json).toBe('{"hello":"world"}');
    expect(parsed.auth.type).toBe("bearer");
    expect(parsed.auth.bearer?.token).toBe("secret-token");
  });

  it("defaults to POST when -d is present and honors -u and --json", () => {
    const parsed = parseCurl(`curl https://httpbin.org/post -u alice:wonder --json '{"ok":true}'`);
    expect(parsed.method).toBe("POST");
    expect(parsed.body.mode).toBe("json");
    expect(parsed.auth.type).toBe("basic");
    expect(parsed.auth.basic).toEqual({ username: "alice", password: "wonder" });
  });

  it("treats -G -d as a GET with query params", () => {
    const parsed = parseCurl("curl -G https://httpbin.org/get -d foo=bar");
    expect(parsed.method).toBe("GET");
    expect(parsed.url).toBe("https://httpbin.org/get?foo=bar");
    expect(parsed.body.mode).toBe("none");
  });
});

describe("toCurl", () => {
  it("round-trips method, url, headers, and body", () => {
    const rendered = toCurl({
      method: "PUT",
      url: "https://httpbin.org/put",
      params: [kv("q", "1")],
      headers: [kv("X-Test", "yes")],
      body: { ...emptyBody(), mode: "json", json: '{"a":1}' },
      auth: emptyAuth("none"),
    });
    expect(rendered).toContain("-X PUT");
    expect(rendered).toContain("https://httpbin.org/put?q=1");
    expect(rendered).toContain("X-Test: yes");
    expect(rendered).toContain("--data-raw");
    const again = parseCurl(rendered);
    expect(again.method).toBe("PUT");
    expect(again.body.json).toBe('{"a":1}');
  });
});
