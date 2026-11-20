import { describe, expect, it } from "vitest";
import { decodeCodec, encodeCodec, hashCodec, md5Hex } from "./codec";

describe("codec", () => {
  it("round-trips url, base64, hex, and html", () => {
    const sample = "hello world & <tag> café";
    expect(decodeCodec("url", encodeCodec("url", sample))).toBe(sample);
    expect(encodeCodec("url", "a b")).toBe("a+b");
    expect(decodeCodec("base64", encodeCodec("base64", sample))).toBe(sample);
    expect(decodeCodec("base64url", encodeCodec("base64url", sample))).toBe(sample);
    expect(decodeCodec("hex", encodeCodec("hex", sample))).toBe(sample);
    expect(decodeCodec("html", encodeCodec("html", "<a href=\"x\">&</a>"))).toBe("<a href=\"x\">&</a>");
  });

  it("hashes well-known strings", async () => {
    expect(md5Hex("hello")).toBe("5d41402abc4b2a76b9719d911017c592");
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(await hashCodec("sha256", "hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});
