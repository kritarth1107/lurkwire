import type { HeaderPair } from "../types";
import { enabledKv, setKv } from "./kv";
import type { WbAuth, WbKv } from "./types";

export function encodeBasic(username: string, password: string): string {
  const raw = `${username}:${password}`;
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(raw)));
}

function headerPairs(list: WbKv[]): HeaderPair[] {
  return enabledKv(list).map((item) => ({ name: item.key, value: item.value }));
}

function setHeader(list: WbKv[], name: string, value: string): WbKv[] {
  return setKv(list, name, value, true);
}

/**
 * Applies static auth helpers (Bearer, Basic, API key, JWT, OAuth2 access token).
 * Digest and AWS SigV4 are applied later in the main process, where crypto and a 401
 * challenge/retry are available.
 */
export function applyAuth(
  auth: WbAuth,
  headers: WbKv[],
  url: string,
): { headers: WbKv[]; url: string; pending?: "digest" | "awsv4" } {
  let nextHeaders = headers.map((item) => ({ ...item }));
  let nextUrl = url;
  switch (auth.type) {
    case "bearer": {
      const token = auth.bearer?.token ?? "";
      if (token) {
        nextHeaders = setHeader(nextHeaders, "Authorization", `Bearer ${token}`);
      }
      break;
    }
    case "jwt": {
      const token = auth.jwt?.token ?? "";
      const name = auth.jwt?.headerName || "Authorization";
      if (token) {
        const value = name.toLowerCase() === "authorization" && !token.toLowerCase().startsWith("bearer ")
          ? `Bearer ${token}`
          : token;
        nextHeaders = setHeader(nextHeaders, name, value);
      }
      break;
    }
    case "basic": {
      const username = auth.basic?.username ?? "";
      const password = auth.basic?.password ?? "";
      nextHeaders = setHeader(nextHeaders, "Authorization", `Basic ${encodeBasic(username, password)}`);
      break;
    }
    case "apikey": {
      const key = auth.apikey?.key ?? "";
      const value = auth.apikey?.value ?? "";
      if (!key) {
        break;
      }
      if ((auth.apikey?.addTo ?? "header") === "query") {
        try {
          const parsed = new URL(nextUrl);
          parsed.searchParams.set(key, value);
          nextUrl = parsed.toString();
        } catch {
          const join = nextUrl.includes("?") ? "&" : "?";
          nextUrl = `${nextUrl}${join}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        }
      } else {
        nextHeaders = setHeader(nextHeaders, key, value);
      }
      break;
    }
    case "oauth2": {
      const token = auth.oauth2?.accessToken ?? "";
      if (token) {
        if ((auth.oauth2?.addTo ?? "header") === "query") {
          try {
            const parsed = new URL(nextUrl);
            parsed.searchParams.set("access_token", token);
            nextUrl = parsed.toString();
          } catch {
            const join = nextUrl.includes("?") ? "&" : "?";
            nextUrl = `${nextUrl}${join}access_token=${encodeURIComponent(token)}`;
          }
        } else {
          nextHeaders = setHeader(nextHeaders, "Authorization", `Bearer ${token}`);
        }
      }
      break;
    }
    case "digest":
      return { headers: nextHeaders, url: nextUrl, pending: "digest" };
    case "awsv4":
      return { headers: nextHeaders, url: nextUrl, pending: "awsv4" };
    default:
      break;
  }
  return { headers: nextHeaders, url: nextUrl };
}

export function headersToPairs(headers: WbKv[]): HeaderPair[] {
  return headerPairs(headers);
}

export function resolveAuth(request: WbAuth, collection?: WbAuth): WbAuth {
  if (request.type === "inherit") {
    return collection ?? { type: "none" };
  }
  return request;
}

export function authLabel(auth: WbAuth): string {
  switch (auth.type) {
    case "none":
      return "No auth";
    case "inherit":
      return "Inherit";
    case "bearer":
      return "Bearer";
    case "basic":
      return "Basic";
    case "apikey":
      return "API key";
    case "jwt":
      return "JWT";
    case "digest":
      return "Digest";
    case "oauth2":
      return "OAuth 2.0";
    case "awsv4":
      return "AWS Signature";
    default:
      return "Auth";
  }
}

/** Placeholder used so snippets can still show a Basic header without pulling in kv ids. */
export function basicHeaderValue(username: string, password: string): string {
  return `Basic ${encodeBasic(username, password)}`;
}

