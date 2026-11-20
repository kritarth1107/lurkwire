import { describe, expect, it } from "vitest";
import { analyzeCors, CORS_PROBE_ORIGIN, corsProbeHeaders } from "./corsProbe";

describe("CORS probe", () => {
  it("builds a preflight Origin and detects a reflected credentialed policy", () => {
    expect(corsProbeHeaders("POST")).toEqual([
      { name: "Origin", value: CORS_PROBE_ORIGIN },
      { name: "Access-Control-Request-Method", value: "POST" },
      { name: "Access-Control-Request-Headers", value: "content-type, authorization" },
    ]);
    const reflected = analyzeCors([
      { name: "Access-Control-Allow-Origin", value: CORS_PROBE_ORIGIN },
      { name: "Access-Control-Allow-Credentials", value: "true" },
      { name: "Access-Control-Allow-Methods", value: "GET, POST" },
    ]);
    expect(reflected.reflectsOrigin).toBe(true);
    expect(reflected.allowCredentials).toBe(true);
    expect(reflected.summary).toContain("cookies");
  });

  it("flags a credentialed wildcard and a missing ACAO header", () => {
    const messy = analyzeCors([
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Credentials", value: "true" },
    ]);
    expect(messy.credentialedWildcard).toBe(true);
    expect(analyzeCors([]).allowOrigin).toBeNull();
    expect(analyzeCors([]).summary).toMatch(/blocked/i);
  });
});
