import { describe, expect, it } from "vitest";
import { fingerprintsMatch, normalizeFingerprint } from "./fingerprint";

describe("fingerprint", () => {
  it("ignores colons and case", () => {
    expect(normalizeFingerprint("AB:cd:ef")).toBe("abcdef");
    expect(fingerprintsMatch("ab:cd", "ABCD")).toBe(true);
    expect(fingerprintsMatch("ab", "cd")).toBe(false);
  });
});
