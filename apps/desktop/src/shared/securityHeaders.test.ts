import { describe, expect, it } from "vitest";
import { analyzeSecurityHeaders } from "./securityHeaders";

describe("analyzeSecurityHeaders", () => {
  it("flags missing CSP, HSTS, and lax cookies on HTTPS", () => {
    const report = analyzeSecurityHeaders(
      [
        { name: "Set-Cookie", value: "session=abc; Path=/" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      "https://example.com/",
    );
    const ids = report.findings.map((item) => item.id);
    expect(ids).toContain("missing-csp");
    expect(ids).toContain("missing-hsts");
    expect(ids).toContain("cookie-not-secure");
    expect(ids).toContain("cookie-not-samesite");
    expect(ids).toContain("cors-wildcard");
    expect(report.missing).toContain("content-security-policy");
  });

  it("flags unsafe-inline CSP and clickjacking gaps", () => {
    const report = analyzeSecurityHeaders(
      [
        { name: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-inline'" },
        { name: "X-Content-Type-Options", value: "nosniff" },
        { name: "Strict-Transport-Security", value: "max-age=63072000" },
      ],
      "https://example.com/",
    );
    const ids = report.findings.map((item) => item.id);
    expect(ids).toContain("csp-unsafe-script");
    expect(ids).toContain("clickjacking");
    expect(report.csp?.["script-src"]).toContain("'unsafe-inline'");
  });
});
