import { expect, test } from "vitest";
import { buildAuthorizationUrl, parseRedirectCallback, tokenForm, type PkcePair } from "./oauthPkce";

const pkce: PkcePair = { verifier: "v", challenge: "c", state: "st" };
const oauth = { grant: "authorization_code" as const, authUrl: "https://idp.example/authorize", clientId: "app", scope: "openid", pkce: true };

test("builds an authorization URL with PKCE", () => {
  const url = new URL(buildAuthorizationUrl(oauth, "http://127.0.0.1:9/callback", pkce));
  expect(url.searchParams.get("code_challenge")).toBe("c");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe("st");
  expect(url.searchParams.get("redirect_uri")).toContain("127.0.0.1");
});

test("parses a redirect and rejects state mismatch", () => {
  expect(parseRedirectCallback("http://127.0.0.1:9/callback?code=abc&state=st", "st").code).toBe("abc");
  expect(() => parseRedirectCallback("http://127.0.0.1:9/callback?code=abc&state=nope", "st")).toThrow(/state/i);
  expect(() => parseRedirectCallback("http://127.0.0.1:9/callback?error=access_denied")).toThrow(/access_denied/);
});

test("builds a token request body", () => {
  const body = new URLSearchParams(tokenForm(oauth, { code: "abc", redirectUri: "http://127.0.0.1/cb", verifier: "v" }));
  expect(body.get("grant_type")).toBe("authorization_code");
  expect(body.get("code_verifier")).toBe("v");
});
