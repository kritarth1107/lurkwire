import { describe, expect, it } from "vitest";
import { interpolate, interpolateObject, kvToMap, mergeVariableLayers } from "./interpolate";
import { kv } from "./kv";

describe("interpolate", () => {
  it("replaces {{var}} from the map and leaves unknowns", () => {
    expect(interpolate("https://{{host}}/{{path}}", { host: "httpbin.org", path: "get" })).toBe(
      "https://httpbin.org/get",
    );
    expect(interpolate("{{missing}}", {})).toBe("{{missing}}");
  });

  it("resolves nested variables up to a depth limit", () => {
    expect(interpolate("{{url}}", { url: "https://{{host}}", host: "example.com" })).toBe("https://example.com");
  });

  it("expands Postman-style dynamic variables", () => {
    const guid = interpolate("{{$guid}}", {});
    expect(guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const frozen = 1_700_000_000_000;
    expect(interpolate("{{$timestamp}}", {}, frozen)).toBe("1700000000");
    expect(interpolate("{{$isoTimestamp}}", {}, frozen)).toBe(new Date(frozen).toISOString());
    const n = Number(interpolate("{{$randomInt(5, 5)}}", {}));
    expect(n).toBe(5);
  });

  it("merges layers with later ones winning and interpolates objects", () => {
    const vars = mergeVariableLayers([
      [kv("a", "1"), kv("b", "2")],
      { b: "3", c: "4" },
      kvToMap([kv("c", "skip", false), kv("d", "5")]),
    ]);
    expect(vars).toEqual({ a: "1", b: "3", c: "4", d: "5" });
    expect(interpolateObject({ url: "https://{{host}}/{{a}}", headers: [{ value: "{{b}}" }] }, { host: "x", ...vars })).toEqual({
      url: "https://x/1",
      headers: [{ value: "3" }],
    });
  });
});
