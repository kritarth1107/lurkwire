import { buildHttpRequest } from "./request";
import { kv } from "./kv";
import type { WbAuth, WbBody, WbKv, WbRequest } from "./types";
import { emptyAuth, emptyBody } from "./types";

export function tokenizeCurl(input: string): string[] {
  const tokens: string[] = [];
  const source = input.replace(/\\\r?\n/g, " ").trim();
  let i = 0;
  while (i < source.length) {
    while (i < source.length && /\s/.test(source[i] ?? "")) {
      i += 1;
    }
    if (i >= source.length) {
      break;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      let buf = "";
      while (i < source.length && source[i] !== quote) {
        if (quote === '"' && source[i] === "\\") {
          i += 1;
          if (i < source.length) {
            buf += source[i];
            i += 1;
          }
          continue;
        }
        buf += source[i];
        i += 1;
      }
      if (i < source.length) {
        i += 1;
      }
      tokens.push(buf);
      continue;
    }
    let buf = "";
    while (i < source.length && !/\s/.test(source[i] ?? "")) {
      if (source[i] === "\\") {
        i += 1;
        if (i < source.length) {
          buf += source[i];
          i += 1;
        }
        continue;
      }
      buf += source[i];
      i += 1;
    }
    tokens.push(buf);
  }
  return tokens;
}

export type ParsedCurl = {
  method: string;
  url: string;
  headers: WbKv[];
  body: WbBody;
  auth: WbAuth;
};

function takeValue(tokens: string[], i: number, inline?: string): { value: string; next: number } {
  if (inline != null && inline !== "") {
    return { value: inline, next: i };
  }
  return { value: tokens[i] ?? "", next: i + 1 };
}

export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenizeCurl(input);
  if (tokens[0]?.toLowerCase() === "curl") {
    tokens.shift();
  }
  let method = "";
  let url = "";
  const headers: WbKv[] = [];
  let bodyText = "";
  let bodyMode: WbBody["mode"] | "" = "";
  let isHead = false;
  let isGetWithData = false;
  let user: string | null = null;
  const formFields: WbKv[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i] ?? "";
    i += 1;
    const eq = token.indexOf("=");
    const flag = eq > 1 && token.startsWith("--") ? token.slice(0, eq) : token;
    const inline = eq > 1 && token.startsWith("--") ? token.slice(eq + 1) : undefined;

    const eat = (current = i) => {
      const result = takeValue(tokens, current, inline);
      i = result.next;
      return result.value;
    };

    switch (flag) {
      case "-X":
      case "--request":
        method = eat().toUpperCase();
        break;
      case "-H":
      case "--header": {
        const raw = eat();
        const colon = raw.indexOf(":");
        if (colon === -1) {
          headers.push(kv(raw.trim(), "", true));
        } else {
          headers.push(kv(raw.slice(0, colon).trim(), raw.slice(colon + 1).trim(), true));
        }
        break;
      }
      case "-d":
      case "--data":
      case "--data-raw":
      case "--data-binary":
        bodyText = eat();
        bodyMode = bodyMode || "raw";
        break;
      case "--data-urlencode":
        bodyText = bodyText ? `${bodyText}&${eat()}` : eat();
        bodyMode = "urlencoded";
        break;
      case "--json":
        bodyText = eat();
        bodyMode = "json";
        headers.push(kv("Content-Type", "application/json", true));
        headers.push(kv("Accept", "application/json", true));
        break;
      case "-F":
      case "--form": {
        const raw = eat();
        const eqIdx = raw.indexOf("=");
        const key = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
        const value = eqIdx === -1 ? "" : raw.slice(eqIdx + 1);
        formFields.push(kv(key, value.startsWith("@") ? value.slice(1) : value, true));
        bodyMode = "formdata";
        break;
      }
      case "-u":
      case "--user":
        user = eat();
        break;
      case "-A":
      case "--user-agent":
        headers.push(kv("User-Agent", eat(), true));
        break;
      case "-b":
      case "--cookie":
        headers.push(kv("Cookie", eat(), true));
        break;
      case "-e":
      case "--referer":
        headers.push(kv("Referer", eat(), true));
        break;
      case "-I":
      case "--head":
        isHead = true;
        break;
      case "-G":
      case "--get":
        isGetWithData = true;
        break;
      case "--url":
        url = eat();
        break;
      case "-o":
      case "--output":
      case "--connect-timeout":
      case "--max-time":
      case "-m":
      case "--retry":
      case "-w":
      case "--write-out":
      case "--unix-socket":
        eat();
        break;
      case "-k":
      case "--insecure":
      case "-s":
      case "--silent":
      case "-S":
      case "--show-error":
      case "-L":
      case "--location":
      case "--compressed":
      case "-v":
      case "--verbose":
      case "-i":
      case "--include":
      case "-#":
      case "--progress-bar":
      case "--http1.1":
      case "--http2":
        break;
      default:
        if (flag.startsWith("-")) {
          // Unknown flag with a possible argument; if the next token doesn't look like a flag or URL, skip it.
          if (inline == null && tokens[i] && !tokens[i]!.startsWith("-") && !/^https?:/i.test(tokens[i]!)) {
            i += 1;
          }
          break;
        }
        if (!url) {
          url = token;
        }
        break;
    }
  }

  if (!method) {
    if (isHead) {
      method = "HEAD";
    } else if (bodyText || formFields.length > 0) {
      method = isGetWithData ? "GET" : "POST";
    } else {
      method = "GET";
    }
  }

  let body = emptyBody();
  if (bodyMode === "formdata") {
    body = { ...body, mode: "formdata", formdata: formFields };
  } else if (bodyMode === "json") {
    body = { ...body, mode: "json", json: bodyText, raw: bodyText, rawLanguage: "json" };
  } else if (bodyMode === "urlencoded" || (bodyText && looksUrlEncoded(bodyText, headers))) {
    const fields = bodyText.split("&").filter(Boolean).map((part) => {
      const eqIdx = part.indexOf("=");
      const key = decodeURIComponent((eqIdx === -1 ? part : part.slice(0, eqIdx)).replace(/\+/g, " "));
      const value = decodeURIComponent((eqIdx === -1 ? "" : part.slice(eqIdx + 1)).replace(/\+/g, " "));
      return kv(key, value);
    });
    body = { ...body, mode: "urlencoded", urlencoded: fields };
  } else if (bodyText) {
    const json = looksJson(bodyText);
    body = {
      ...body,
      mode: json ? "json" : "raw",
      raw: bodyText,
      json: json ? bodyText : "",
      rawLanguage: json ? "json" : "text",
    };
  }

  let auth = emptyAuth("none");
  if (user != null) {
    const colon = user.indexOf(":");
    auth = {
      type: "basic",
      basic: {
        username: colon === -1 ? user : user.slice(0, colon),
        password: colon === -1 ? "" : user.slice(colon + 1),
      },
    };
  } else {
    const authorization = headers.find((item) => item.key.toLowerCase() === "authorization")?.value ?? "";
    const bearer = /^bearer\s+(.+)$/i.exec(authorization);
    if (bearer) {
      auth = { type: "bearer", bearer: { token: bearer[1] ?? "" } };
    }
  }

  if (isGetWithData && bodyText) {
    url = appendQuery(url, bodyText);
    body = emptyBody();
  }

  return { method, url, headers, body, auth };
}

function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function looksUrlEncoded(text: string, headers: WbKv[]): boolean {
  const mime = headers.find((item) => item.key.toLowerCase() === "content-type")?.value ?? "";
  if (mime.includes("application/x-www-form-urlencoded")) {
    return true;
  }
  return text.includes("=") && !text.includes("{") && !text.includes("\n") && text.includes("&");
}

function appendQuery(url: string, query: string): string {
  const join = url.includes("?") ? "&" : "?";
  return `${url}${join}${query}`;
}

export function shellQuote(value: string): string {
  if (value === "") {
    return "''";
  }
  if (/^[A-Za-z0-9_./:=,+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(
  request: Pick<WbRequest, "method" | "url" | "params" | "headers" | "body" | "auth">,
): string {
  const built = buildHttpRequest(request);
  const parts = ["curl", "--path-as-is", "-X", built.method, shellQuote(built.url)];
  for (const header of built.headers) {
    parts.push("-H", shellQuote(`${header.name}: ${header.value}`));
  }
  if (built.body) {
    if (built.bodyBase64) {
      parts.push("--data-binary", shellQuote(built.body));
    } else {
      parts.push("--data-raw", shellQuote(built.body));
    }
  }
  return parts.join(" ");
}
