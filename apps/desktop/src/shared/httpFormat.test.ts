import { describe, expect, it } from "vitest";
import { decodeText, languageFor, prettyBody, toHexDump } from "./httpFormat";

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

describe("decodeText charset", () => {
  it("decodes latin-1 and html charset", () => {
    const latin = new Uint8Array([0x43, 0x61, 0x66, 0xe9]);
    expect(decodeText(latin, [{ name: "Content-Type", value: "text/plain; charset=iso-8859-1" }])).toBe("Café");
    const meta = new TextEncoder().encode('<meta charset="utf-8"><p>ok</p>');
    expect(decodeText(meta, [])).toContain("ok");
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeText(bom, [])).toBe("A");
  });
});
