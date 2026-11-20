import { describe, expect, it } from "vitest";
import { cookieTargetUrl } from "./siteInfo";

describe("cookieTargetUrl", () => {
  it("builds the URL Electron needs to remove a cookie", () => {
    expect(cookieTargetUrl({ domain: ".httpbin.org", path: "/", secure: true })).toBe("https://httpbin.org/");
    expect(cookieTargetUrl({ domain: "localhost", path: "/app", secure: false })).toBe("http://localhost/app");
  });
});
