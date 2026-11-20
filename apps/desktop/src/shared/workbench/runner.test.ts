import { describe, expect, it } from "vitest";
import { parseRunnerData } from "./runner";
import { interpolate, mergeVariableLayers } from "./interpolate";

describe("parseRunnerData", () => {
  it("parses CSV with quoted commas", () => {
    const rows = parseRunnerData('id,name\n1,"Ada, Lovelace"\n2,Grace');
    expect(rows).toEqual([
      { id: "1", name: "Ada, Lovelace" },
      { id: "2", name: "Grace" },
    ]);
  });

  it("parses a JSON array and interpolates a row over collection vars", () => {
    const rows = parseRunnerData('[{"id":"42","q":"probe"}]');
    expect(rows[0]).toEqual({ id: "42", q: "probe" });
    const vars = mergeVariableLayers([{ baseUrl: "https://httpbin.org" }, rows[0]]);
    expect(interpolate("{{baseUrl}}/get?id={{id}}&q={{q}}", vars)).toBe("https://httpbin.org/get?id=42&q=probe");
  });
});
