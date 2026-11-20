import { describe, expect, it } from "vitest";
import { applyMatchRules } from "./matchReplace";

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
