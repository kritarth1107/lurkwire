import { fromBytes } from "./codec";
import { PRODUCT_NAME, PRODUCT_VERSION } from "./product";
import type { FlowDetail, HeaderPair } from "./types";

export type HarHeader = { name: string; value: string };
export type HarCookie = { name: string; value: string; path?: string; domain?: string };
export type HarPostData = { mimeType: string; text: string };
export type HarContent = { size: number; mimeType: string; text?: string; encoding?: string };
export type HarRequest = {
  method: string;
  url: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  queryString: HarHeader[];
  postData?: HarPostData;
  headersSize: number;
  bodySize: number;
};
export type HarResponse = {
  status: number;
  statusText: string;
  httpVersion: string;
  cookies: HarCookie[];
  headers: HarHeader[];
  content: HarContent;
  redirectURL: string;
  headersSize: number;
  bodySize: number;
};
export type HarEntry = {
  startedDateTime: string;
  time: number;
  request: HarRequest;
  response: HarResponse;
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
  comment?: string;
  _source?: string;
};
export type HarLog = {
  log: {
    version: "1.2";
    creator: { name: string; version: string };
    entries: HarEntry[];
  };
};

export type HarBody = {
  text?: string;
  base64?: string;
};

export type HarFlowInput = FlowDetail & {
  requestBody?: HarBody;
  responseBody?: HarBody;
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  418: "I'm a teapot",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

export function statusText(status: number | null): string {
  if (status == null) {
    return "";
  }
  return STATUS_TEXT[status] ?? "";
}

function headersOf(list: HeaderPair[]): HarHeader[] {
  return list.map((header) => ({ name: header.name, value: header.value }));
}

function headerValue(list: HeaderPair[], name: string): string {
  const lower = name.toLowerCase();
  return list.find((header) => header.name.toLowerCase() === lower)?.value ?? "";
}

function queryStringOf(url: string, query: string): HarHeader[] {
  const out: HarHeader[] = [];
  const raw = query || (() => {
    try {
      return new URL(url).search.replace(/^\?/, "");
    } catch {
      return "";
    }
  })();
  if (!raw) {
    return out;
  }
  for (const part of raw.split("&")) {
    if (!part) {
      continue;
    }
    const idx = part.indexOf("=");
    out.push({
      name: idx === -1 ? decodeURIComponent(part) : decodeURIComponent(part.slice(0, idx)),
      value: idx === -1 ? "" : decodeURIComponent(part.slice(idx + 1).replace(/\+/g, " ")),
    });
  }
  return out;
}

function cookiesFromHeader(value: string, request: boolean): HarCookie[] {
  if (!value) {
    return [];
  }
  if (request) {
    return value.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const idx = part.indexOf("=");
      return { name: idx === -1 ? part : part.slice(0, idx).trim(), value: idx === -1 ? "" : part.slice(idx + 1).trim() };
    });
  }
  const first = value.split(";")[0] ?? "";
  const idx = first.indexOf("=");
  if (idx <= 0) {
    return [];
  }
  const cookie: HarCookie = { name: first.slice(0, idx).trim(), value: first.slice(idx + 1).trim() };
  for (const part of value.split(";").slice(1)) {
    const eq = part.indexOf("=");
    const key = (eq === -1 ? part : part.slice(0, eq)).trim().toLowerCase();
    const val = eq === -1 ? "" : part.slice(eq + 1).trim();
    if (key === "path") {
      cookie.path = val;
    } else if (key === "domain") {
      cookie.domain = val;
    }
  }
  return [cookie];
}

function requestCookies(headers: HeaderPair[]): HarCookie[] {
  return cookiesFromHeader(headerValue(headers, "cookie"), true);
}

function responseCookies(headers: HeaderPair[]): HarCookie[] {
  const out: HarCookie[] = [];
  for (const header of headers) {
    if (header.name.toLowerCase() === "set-cookie") {
      out.push(...cookiesFromHeader(header.value, false));
    }
  }
  return out;
}

function mimeOf(headers: HeaderPair[], fallback = "application/octet-stream"): string {
  return headerValue(headers, "content-type") || fallback;
}

function isMostlyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) {
    return true;
  }
  let odd = 0;
  const n = Math.min(bytes.length, 1024);
  for (let i = 0; i < n; i++) {
    const b = bytes[i]!;
    if (b === 0 || (b < 9 && b !== 9 && b !== 10 && b !== 13)) {
      odd += 1;
    }
  }
  return odd / n < 0.05;
}

export function bodyToHarContent(body: HarBody | undefined, size: number, mimeType: string): HarContent {
  if (body?.text != null) {
    return { size: size || body.text.length, mimeType, text: body.text };
  }
  if (body?.base64) {
    try {
      const bytes = Uint8Array.from(atob(body.base64), (ch) => ch.charCodeAt(0));
      if (isMostlyText(bytes)) {
        return { size: size || bytes.length, mimeType, text: fromBytes(bytes) };
      }
    } catch {
      /* keep base64 */
    }
    return { size, mimeType, text: body.base64, encoding: "base64" };
  }
  return { size, mimeType };
}

export function flowToHarEntry(flow: HarFlowInput): HarEntry {
  const httpVersion = flow.http_version || "HTTP/1.1";
  const reqMime = mimeOf(flow.req_headers, "application/octet-stream");
  const postText = flow.requestBody?.text;
  const request: HarRequest = {
    method: flow.method,
    url: flow.url,
    httpVersion,
    cookies: requestCookies(flow.req_headers),
    headers: headersOf(flow.req_headers),
    queryString: queryStringOf(flow.url, flow.query),
    headersSize: -1,
    bodySize: flow.req_len,
  };
  if (postText || flow.requestBody?.base64) {
    const content = bodyToHarContent(flow.requestBody, flow.req_len, reqMime);
    request.postData = { mimeType: reqMime, text: content.text ?? "" };
  }
  const redirect = headerValue(flow.resp_headers, "location");
  const response: HarResponse = {
    status: flow.status ?? 0,
    statusText: statusText(flow.status),
    httpVersion,
    cookies: responseCookies(flow.resp_headers),
    headers: headersOf(flow.resp_headers),
    content: bodyToHarContent(flow.responseBody, flow.resp_len, flow.mime || mimeOf(flow.resp_headers, "application/octet-stream")),
    redirectURL: redirect,
    headersSize: -1,
    bodySize: flow.resp_len,
  };
  const comment = [flow.note, flow.source ? `source=${flow.source}` : ""].filter(Boolean).join(" ").trim();
  return {
    startedDateTime: new Date(flow.ts).toISOString(),
    time: flow.duration_ms ?? 0,
    request,
    response,
    cache: {},
    timings: { send: 0, wait: flow.duration_ms ?? 0, receive: 0 },
    comment: comment || undefined,
    _source: flow.source || undefined,
  };
}

export function flowsToHar(flows: HarFlowInput[], creator = { name: PRODUCT_NAME, version: PRODUCT_VERSION }): HarLog {
  return {
    log: {
      version: "1.2",
      creator,
      entries: flows.map(flowToHarEntry),
    },
  };
}

export function harToString(har: HarLog): string {
  return `${JSON.stringify(har, null, 2)}\n`;
}
