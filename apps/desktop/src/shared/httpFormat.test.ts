import { describe, expect, it } from "vitest";
import { languageFor, prettyBody, toHexDump } from "./httpFormat";

describe("httpFormat", () => {
  it("pretty-prints JSON and form bodies", () => {
    expect(prettyBody('{"a":1}', "application/json")).toBe("{\n  \"a\": 1\n}");
    expect(prettyBody("a=b&c=d", "application/x-www-form-urlencoded")).toBe("a=b\nc=d");
    expect(languageFor("application/json", "{}")).toBe("json");
  });

  it("dumps bytes as hex", () => {
    const dump = toHexDump(new Uint8Array([65, 66, 0, 67]));
    expect(dump).toContain("41 42 00 43");
    expect(dump).toContain("AB.C");
  });
});
