import { expect, test } from "vitest";
import { applySessionHeaders, compareAuthz } from "./autorize";

const baseline = { sessionId: "o", sessionName: "Original", status: 200, length: 12, body: '{"id":1,"role":"admin"}' };

test("flags identical success as possible broken access control", () => {
  const verdict = compareAuthz(baseline, { ...baseline, sessionId: "anon", sessionName: "Unauthenticated" });
  expect(verdict.kind).toBe("same");
});

test("treats 403 as denied", () => {
  const verdict = compareAuthz(baseline, { sessionId: "anon", sessionName: "Unauthenticated", status: 403, length: 0, body: "denied" });
  expect(verdict.kind).toBe("denied");
});

test("strips cookies and authorization for the anonymous session", () => {
  const headers = applySessionHeaders(
    [
      { name: "Cookie", value: "sid=1" },
      { name: "Authorization", value: "Bearer x" },
      { name: "Accept", value: "application/json" },
    ],
    { id: "anon", name: "Unauthenticated", headers: [], stripAuth: true, cookie: "" },
  );
  expect(headers).toEqual([{ name: "Accept", value: "application/json" }]);
});
