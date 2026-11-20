import { describe, expect, it } from "vitest";
import { isLocalLlmUrl, redactForCloud } from "./redact";

describe("redactForCloud", () => {
  it("redacts bearer tokens, cookies, and JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.signaturexx";
    const result = redactForCloud(
      `Authorization: Bearer super-secret-token\nCookie: session=abc\n${jwt}\n{"password":"hunter2"}`,
    );
    expect(result.redacted).toBe(true);
    expect(result.text).not.toContain("super-secret-token");
    expect(result.text).not.toContain("session=abc");
    expect(result.text).not.toContain("hunter2");
    expect(result.text).not.toContain(jwt);
    expect(result.text).toContain("[REDACTED]");
  });

  it("leaves ordinary request text alone", () => {
    const result = redactForCloud("GET /health HTTP/1.1\nHost: example.com");
    expect(result.redacted).toBe(false);
    expect(result.text).toContain("example.com");
  });
});

describe("isLocalLlmUrl", () => {
  it("accepts loopback Ollama", () => {
    expect(isLocalLlmUrl("http://127.0.0.1:11434/v1")).toBe(true);
    expect(isLocalLlmUrl("https://api.openai.com/v1")).toBe(false);
  });
});
