import { describe, expect, it } from "vitest";
import { applySetCookieHeaders, cookieHeaderFor, cookieHeaderList, cookiesFromNetscape, cookiesToNetscape, parseSetCookie } from "./cookies";

describe("cookie jar", () => {
  it("parses Set-Cookie and sends it back to the same host and path", () => {
    const parsed = parseSetCookie(
      "session=abc123; Path=/; Domain=httpbin.org; HttpOnly; Secure; SameSite=Lax",
      "https://httpbin.org/cookies",
    );
    expect(parsed).toMatchObject({
      name: "session",
      value: "abc123",
      domain: "httpbin.org",
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
    const jar = applySetCookieHeaders([], [{ name: "Set-Cookie", value: "session=abc123; Path=/" }], "https://httpbin.org/get");
    expect(cookieHeaderFor(jar, "https://httpbin.org/anything")).toBe("session=abc123");
    expect(cookieHeaderFor(jar, "https://example.com/")).toBe("");
    expect(cookieHeaderFor(jar, "http://httpbin.org/get")).toBe("session=abc123");
  });

  it("drops expired cookies and honors the Secure flag", () => {
    const jar = applySetCookieHeaders(
      [],
      [{ name: "Set-Cookie", value: "tok=v; Path=/; Secure; Max-Age=0" }],
      "https://example.com/",
    );
    expect(cookieHeaderFor(jar, "https://example.com/")).toBe("");
    const live = applySetCookieHeaders(
      [],
      [{ name: "Set-Cookie", value: "tok=v; Path=/; Secure" }],
      "https://example.com/",
    );
    expect(cookieHeaderFor(live, "https://example.com/")).toBe("tok=v");
    expect(cookieHeaderFor(live, "http://example.com/")).toBe("");
  });

  it("round-trips a Netscape cookie file", () => {
    const jar = [
      { name: "session", value: "abc123", domain: "httpbin.org", path: "/", secure: true, httpOnly: true, expires: 1_800_000_000_000 },
      { name: "x", value: "1", domain: "localhost", path: "/", secure: false },
    ];
    const text = cookiesToNetscape(jar);
    expect(text).toContain("# Netscape HTTP Cookie File");
    expect(text).toContain(".httpbin.org\tTRUE\t/\tTRUE\t1800000000\tsession\tabc123");
    const parsed = cookiesFromNetscape(text);
    expect(parsed).toEqual([
      { name: "session", value: "abc123", domain: "httpbin.org", path: "/", secure: true, expires: 1_800_000_000_000 },
      { name: "x", value: "1", domain: "localhost", path: "/", secure: false, expires: null },
    ]);
    expect(cookieHeaderList(parsed)).toBe("session=abc123; x=1");
  });
});
