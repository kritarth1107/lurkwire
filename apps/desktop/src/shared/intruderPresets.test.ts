import { expect, test } from "vitest";
import { INTRUDER_PRESETS, presetPayloads } from "./intruderPresets";

test("ships named payload packs", () => {
  expect(INTRUDER_PRESETS.map((item) => item.id)).toContain("sqli");
  expect(presetPayloads("numeric")).toContain("0");
  expect(presetPayloads("missing")).toEqual([]);
});
