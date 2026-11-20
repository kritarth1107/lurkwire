import { describe, expect, it } from "vitest";
import { flowToCurl, formatBytes, parseRawRequest } from "./http";

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

  it("renders a cURL command from a flow", () => {
    const curl = flowToCurl(
      {
        method: "POST",
        url: "https://httpbin.org/post",
        req_headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "Content-Length", value: "9" },
        ],
      },
      '{"z":2}',
    );
    expect(curl).toContain("curl --path-as-is -X POST 'https://httpbin.org/post'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).not.toContain("Content-Length");
    expect(curl).toContain("--data-raw '{\"z\":2}'");
  });
});
