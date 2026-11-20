import { expect, test } from "vitest";
import { MATCH_TEMPLATES, rulesFromTemplate } from "./matchTemplates";

test("expands each template into named rules", () => {
  expect(MATCH_TEMPLATES.length).toBeGreaterThan(2);
  const rules = rulesFromTemplate("strip-auth");
  expect(rules.length).toBe(2);
  expect(rules.every((item) => item.id && item.name && item.match)).toBe(true);
});
