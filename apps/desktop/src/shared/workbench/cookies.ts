import type { WbCookie } from "./types";

export function parseSetCookie(header: string, url: string): WbCookie | null {
  const parts = header.split(";").map((part) => part.trim()).filter(Boolean);
  const first = parts[0];
  if (!first) {
    return null;
  }
  const eq = first.indexOf("=");
  if (eq <= 0) {
    return null;
  }
  let host = "";
  let defaultPath = "/";
  let secureUrl = false;
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    defaultPath = parsed.pathname.startsWith("/") ? parsed.pathname : "/";
    const slash = defaultPath.lastIndexOf("/");
    defaultPath = slash > 0 ? defaultPath.slice(0, slash) : "/";
    secureUrl = parsed.protocol === "https:";
  } catch {
    /* ignore */
  }
  const cookie: WbCookie = {
    name: first.slice(0, eq).trim(),
    value: first.slice(eq + 1).trim(),
    domain: host,
    path: defaultPath || "/",
    expires: null,
    secure: false,
    httpOnly: false,
  };
  for (const part of parts.slice(1)) {
    const idx = part.indexOf("=");
    const key = (idx === -1 ? part : part.slice(0, idx)).trim().toLowerCase();
    const value = idx === -1 ? "" : part.slice(idx + 1).trim();
    if (key === "domain" && value) {
      cookie.domain = value.replace(/^\./, "").toLowerCase();
    } else if (key === "path" && value) {
      cookie.path = value;
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    } else if (key === "samesite") {
      const s = value.toLowerCase();
      cookie.sameSite = s === "strict" ? "Strict" : s === "none" ? "None" : "Lax";
    } else if (key === "max-age") {
      const seconds = Number(value);
      if (Number.isFinite(seconds)) {
        cookie.expires = Date.now() + seconds * 1000;
      }
    } else if (key === "expires") {
      const ts = Date.parse(value);
      if (Number.isFinite(ts)) {
        cookie.expires = ts;
      }
    }
  }
  if (cookie.secure && !secureUrl && !cookie.domain) {
    /* still store; sending will honor the Secure flag */
  }
  return cookie;
}

export function upsertCookies(jar: WbCookie[], incoming: WbCookie[]): WbCookie[] {
  const next = jar.slice();
  for (const cookie of incoming) {
    const idx = next.findIndex(
      (item) =>
        item.name === cookie.name &&
        item.domain.toLowerCase() === cookie.domain.toLowerCase() &&
        item.path === cookie.path,
    );
    if (cookie.expires != null && cookie.expires <= Date.now()) {
      if (idx !== -1) {
        next.splice(idx, 1);
      }
      continue;
    }
    if (idx === -1) {
      next.push(cookie);
    } else {
      next[idx] = cookie;
    }
  }
  return next.filter((item) => item.expires == null || item.expires > Date.now());
}

function domainMatches(cookieDomain: string, host: string): boolean {
  const domain = cookieDomain.replace(/^\./, "").toLowerCase();
  const hostname = host.toLowerCase();
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function pathMatches(cookiePath: string, path: string): boolean {
  if (cookiePath === "/" || cookiePath === "") {
    return true;
  }
  return path === cookiePath || path.startsWith(cookiePath.endsWith("/") ? cookiePath : `${cookiePath}/`);
}

export function cookiesForUrl(jar: WbCookie[], url: string): WbCookie[] {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  const now = Date.now();
  return jar.filter((cookie) => {
    if (cookie.expires != null && cookie.expires <= now) {
      return false;
    }
    if (cookie.secure && parsed.protocol !== "https:") {
      return false;
    }
    return domainMatches(cookie.domain, parsed.hostname) && pathMatches(cookie.path, parsed.pathname);
  });
}

export function cookieHeaderFor(jar: WbCookie[], url: string): string {
  return cookiesForUrl(jar, url)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function applySetCookieHeaders(jar: WbCookie[], headers: { name: string; value: string }[], url: string): WbCookie[] {
  const incoming: WbCookie[] = [];
  for (const header of headers) {
    if (header.name.toLowerCase() !== "set-cookie") {
      continue;
    }
    const parsed = parseSetCookie(header.value, url);
    if (parsed) {
      incoming.push(parsed);
    }
  }
  return incoming.length ? upsertCookies(jar, incoming) : jar;
}
