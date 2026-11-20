import { expect, test } from "vitest";
import { clTeProbe, parseClFirst, SMUGGLE_MARKER } from "./smugglingLab";

test("the CL.TE probe leaves a second request after six body bytes", () => {
  const verdict = parseClFirst(clTeProbe("127.0.0.1", "/lab"));
  expect(verdict.smuggled).toBe(true);
  expect(verdict.leftover).toContain(SMUGGLE_MARKER);
  expect(verdict.leftover).toContain("GET /lab");
});
