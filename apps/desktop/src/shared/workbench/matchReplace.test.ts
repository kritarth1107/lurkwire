import { describe, expect, it } from "vitest";
import { applyMatchRules, applyMatchRulesFor } from "./matchReplace";

describe("applyMatchRules", () => {
  it("replaces literals in the URL and body, and regex in headers", () => {
    const { value, applied } = applyMatchRules(
      {
        url: "https://staging.example.com/v1/users",
        headers: [{ name: "Host", value: "staging.example.com" }],
        body: "role=user",
      },
      [
        { id: "1", enabled: true, name: "to-prod-host", match: "staging.example.com", replace: "example.com", regex: false, where: "anywhere" },
        { id: "2", enabled: true, name: "admin-role", match: "role=(\\w+)", replace: "role=admin", regex: true, where: "body" },
        { id: "3", enabled: false, name: "off", match: "users", replace: "admins", regex: false, where: "url" },
      ],
    );
    expect(value.url).toBe("https://example.com/v1/users");
    expect(value.headers[0]?.value).toBe("example.com");
    expect(value.body).toBe("role=admin");
    expect(applied).toEqual(["to-prod-host", "admin-role"]);
  });
});

describe("direction-aware match/replace", () => {
  const rules = [
    { id: "1", enabled: true, name: "req-only", match: "USER", replace: "admin", regex: false, where: "body" as const, direction: "request" as const },
    { id: "2", enabled: true, name: "resp-only", match: "denied", replace: "ok", regex: false, where: "body" as const, direction: "response" as const },
  ];

  it("applies request rules to requests and response rules to responses", () => {
    const req = applyMatchRulesFor({ url: "https://x", headers: [], body: "USER=1&denied=1" }, rules, "request");
    expect(req.value.body).toBe("admin=1&denied=1");
    expect(req.applied).toEqual(["req-only"]);
    const resp = applyMatchRulesFor({ url: "https://x", headers: [], body: "USER=1&denied=1" }, rules, "response");
    expect(resp.value.body).toBe("USER=1&ok=1");
    expect(resp.applied).toEqual(["resp-only"]);
  });
});
