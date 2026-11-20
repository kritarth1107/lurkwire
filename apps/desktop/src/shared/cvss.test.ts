import { expect, test } from "vitest";
import { parseCvssVector, scoreCvss } from "./cvss";

test("scores the canonical 9.8 network critical vector", () => {
  const result = scoreCvss({ AV: "N", AC: "L", PR: "N", UI: "N", S: "U", C: "H", I: "H", A: "H" });
  expect(result.score).toBe(9.8);
  expect(result.severity).toBe("Critical");
  expect(result.vector).toBe("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
});

test("scores a local privilege issue", () => {
  const result = scoreCvss({ AV: "L", AC: "L", PR: "L", UI: "N", S: "U", C: "H", I: "N", A: "N" });
  expect(result.score).toBe(5.5);
  expect(result.severity).toBe("Medium");
});

test("parses a vector string", () => {
  const parsed = parseCvssVector("CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N");
  expect(parsed).toBeTruthy();
  expect(scoreCvss(parsed!).score).toBe(4.7);
});
