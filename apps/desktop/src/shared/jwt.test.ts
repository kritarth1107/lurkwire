import { describe, expect, it } from "vitest";
import { decodeJwt, extractJwts, signJwt, unsignedJwt, verifyJwt } from "./jwt";

const header = '{ "typ": "JWT", "alg": "HS256" }';
const payload = '{ "sub": "42", "name": "Ada", "iat": 1516239022 }';

describe("jwt", () => {
  it("signs, decodes, and verifies HS256", async () => {
    const token = await signJwt(header, payload, "s3cret", "HS256");
    const decoded = decodeJwt(token);
    expect(decoded.payload.sub).toBe("42");
    expect(decoded.claims.iat).toBe("2018-01-18T01:30:22.000Z");
    const check = await verifyJwt(token, "s3cret");
    expect(check.ok).toBe(true);
    const bad = await verifyJwt(token, "wrong");
    expect(bad.ok).toBe(false);
  });

  it("re-signs with HS512 and issues alg none", async () => {
    const token = await signJwt(header, payload, "s3cret", "HS512");
    expect((await verifyJwt(token, "s3cret")).ok).toBe(true);
    const none = unsignedJwt(header, payload);
    expect(none.endsWith(".")).toBe(true);
    const decoded = decodeJwt(none);
    expect(decoded.alg).toBe("none");
    expect(decoded.signature).toBe("");
    expect((await verifyJwt(none, "")).ok).toBe(true);
  });

  it("extracts JWTs from cookie text", async () => {
    const token = await signJwt(header, payload, "s3cret", "HS256");
    const found = extractJwts(`Cookie: session=${token}; other=1`);
    expect(found).toEqual([token]);
  });
});
