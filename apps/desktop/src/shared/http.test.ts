import { describe, expect, it } from "vitest";
import { formatBytes, parseRawRequest } from "./http";

describe("http helpers", () => {
  it("formats byte sizes", () => {
    expect(formatBytes(200)).toBe("200 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("parses a raw HTTP request", () => {
    const parsed = parseRawRequest(
      "POST /login HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{\"a\":1}",
      "https://example.com/old",
    );
    expect(parsed.method).toBe("POST");
    expect(parsed.url).toBe("https://example.com/login");
    expect(parsed.headers).toEqual([
      { name: "Host", value: "example.com" },
      { name: "Content-Type", value: "application/json" },
    ]);
    expect(parsed.body).toBe('{"a":1}');
  });
});
