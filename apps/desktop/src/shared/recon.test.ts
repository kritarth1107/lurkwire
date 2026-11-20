import { describe, expect, it } from "vitest";
import { normalizeDomain, parseCrtSh, parseWhoisReferral } from "./recon";

describe("normalizeDomain", () => {
  it("strips scheme, www, and path", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe("example.com");
    expect(normalizeDomain("example.com:443")).toBe("example.com");
  });
});

describe("parseWhoisReferral", () => {
  it("reads refer and whois lines", () => {
    expect(parseWhoisReferral("refer: whois.verisign-grs.com\n")).toBe("whois.verisign-grs.com");
    expect(parseWhoisReferral("whois: whois.nic.uk")).toBe("whois.nic.uk");
  });
});

describe("parseCrtSh", () => {
  it("deduplicates SAN lists", () => {
    const rows = [
      { id: 1, common_name: "example.com", name_value: "example.com\nwww.example.com", issuer_name: "A", not_before: "1", not_after: "2" },
      { id: 2, common_name: "example.com", name_value: "www.example.com\nexample.com", issuer_name: "A", not_before: "1", not_after: "2" },
    ];
    expect(parseCrtSh(rows)).toHaveLength(1);
  });
});
