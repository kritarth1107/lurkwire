import { describe, expect, it } from "vitest";
import { decodeAll, identifyHash } from "./decodeAll";

describe("decodeAll and hash identifier", () => {
  it("unwraps stacked URL and Base64 encodings", () => {
    const inner = "role=admin";
    const stacked = encodeURIComponent(Buffer.from(inner).toString("base64"));
    const steps = decodeAll(stacked);
    expect(steps.some((step) => step.codec === "url")).toBe(true);
    expect(steps[steps.length - 1]?.output).toBe(inner);
  });

  it("identifies common hash lengths and bcrypt prefixes", () => {
    expect(identifyHash("5d41402abc4b2a76b9719d911017c592").map((item) => item.alg)).toContain("md5");
    expect(identifyHash("2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae").map((item) => item.alg)).toContain("sha256");
    expect(identifyHash("$2a$10$abcdefghijklmnopqrstuv").map((item) => item.alg)).toContain("bcrypt");
  });
});
