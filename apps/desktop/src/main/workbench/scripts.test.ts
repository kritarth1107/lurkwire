import { describe, expect, it } from "vitest";
import { runWorkbenchScript } from "./scripts";

const request = {
  method: "GET",
  url: "https://httpbin.org/get",
  headers: [{ name: "Accept", value: "application/json" }],
};

describe("runWorkbenchScript", () => {
  it("runs pre-request scripts that set environment variables", () => {
    const result = runWorkbenchScript(
      `pm.environment.set("token", "abc");
       console.log("token", pm.variables.get("token"));`,
      "prerequest",
      { env: {}, globals: {}, collection: {}, request },
    );
    expect(result.env.token).toBe("abc");
    expect(result.logs[0]).toContain("abc");
    expect(result.tests).toEqual([]);
  });

  it("runs pm.test assertions against a response", () => {
    const result = runWorkbenchScript(
      `pm.test("status is 200", () => pm.response.to.have.status(200));
       pm.test("has a uuid", () => {
         pm.expect(pm.response.json()).to.have.property("uuid");
         pm.expect(pm.response.code).to.be.below(300);
       });
       pm.test("fails clearly", () => pm.expect(pm.response.code).to.equal(500));`,
      "test",
      {
        env: {},
        globals: {},
        collection: {},
        request,
        response: {
          code: 200,
          status: 200,
          headers: [{ name: "Content-Type", value: "application/json" }],
          text: '{"uuid":"1-2-3"}',
          responseTime: 12,
          responseSize: 16,
        },
      },
    );
    expect(result.tests[0]).toMatchObject({ name: "status is 200", passed: true });
    expect(result.tests[1]?.passed).toBe(true);
    expect(result.tests[2]?.passed).toBe(false);
    expect(result.tests[2]?.error).toContain("500");
  });

  it("does not allow escaping the sandbox with eval", () => {
    const result = runWorkbenchScript(`eval("pm.environment.set('x', 'no')")`, "prerequest", {
      env: {},
      globals: {},
      collection: {},
      request,
    });
    expect(result.env.x).toBeUndefined();
    expect(result.tests.some((item) => item.passed === false)).toBe(true);
  });
});
