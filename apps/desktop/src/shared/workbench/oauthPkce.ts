import type { WbOAuth2 } from "./types";

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) {
    bin += String.fromCharCode(byte);
  }
  const base = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return base.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type PkcePair = {
  verifier: string;
  challenge: string;
  state: string;
};

export async function generatePkce(): Promise<PkcePair> {
  const random = (size: number) => {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return bytes;
  };
  const verifier = base64Url(random(32));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    verifier,
    challenge: base64Url(new Uint8Array(digest)),
    state: base64Url(random(16)),
  };
}

export function buildAuthorizationUrl(
  oauth: WbOAuth2,
  redirectUri: string,
  pkce: PkcePair,
): string {
  if (!oauth.authUrl) {
    throw new Error("Set the authorization URL first.");
  }
  const url = new URL(oauth.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oauth.clientId ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", pkce.state);
  if (oauth.scope) {
    url.searchParams.set("scope", oauth.scope);
  }
  if (oauth.audience) {
    url.searchParams.set("audience", oauth.audience);
  }
  if (oauth.pkce !== false) {
    url.searchParams.set("code_challenge", pkce.challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

export function parseRedirectCallback(url: string, expectedState?: string): { code: string; state?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("That is not a valid redirect URL.");
  }
  const error = parsed.searchParams.get("error") ?? parsed.hash.match(/error=([^&]+)/)?.[1];
  if (error) {
    const desc = parsed.searchParams.get("error_description") ?? "";
    throw new Error(`Authorization failed: ${error}${desc ? ` (${desc})` : ""}`);
  }
  const code = parsed.searchParams.get("code") ?? new URLSearchParams(parsed.hash.replace(/^#/, "")).get("code");
  const state = parsed.searchParams.get("state") ?? new URLSearchParams(parsed.hash.replace(/^#/, "")).get("state") ?? undefined;
  if (!code) {
    throw new Error("The redirect URL does not contain an authorization code.");
  }
  if (expectedState && state && state !== expectedState) {
    throw new Error("OAuth state mismatch. Restart the authorization flow.");
  }
  return { code, state: state ?? undefined };
}

export function tokenForm(oauth: WbOAuth2, input: { code: string; redirectUri: string; verifier?: string }): string {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: oauth.clientId ?? "",
  });
  if (oauth.clientSecret) {
    body.set("client_secret", oauth.clientSecret);
  }
  if (input.verifier && oauth.pkce !== false) {
    body.set("code_verifier", input.verifier);
  }
  if (oauth.scope) {
    body.set("scope", oauth.scope);
  }
  return body.toString();
}
