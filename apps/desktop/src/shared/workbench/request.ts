import type { FlowDetail, HeaderPair, RepeaterSendRequest } from "../types";
import { applyAuth, resolveAuth } from "./auth";
import { newId } from "./id";
import { enabledKv, kv, setKv } from "./kv";
import type { WbAuth, WbBody, WbKv, WbRequest } from "./types";
import { emptyAuth, emptyBody } from "./types";

const SKIP_FROM_FLOW = new Set([
  "host",
  "content-length",
  "connection",
  "proxy-connection",
  "proxy-authorization",
  "transfer-encoding",
  "keep-alive",
]);

export function buildUrl(url: string, params: WbKv[]): string {
  const enabled = enabledKv(params);
  if (enabled.length === 0) {
    return url;
  }
  try {
    const parsed = new URL(url);
    for (const item of enabled) {
      parsed.searchParams.append(item.key, item.value);
    }
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    const query = enabled
      .map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`)
      .join("&");
    return `${url}${join}${query}`;
  }
}

export function ensureContentType(headers: WbKv[], mime: string): WbKv[] {
  const existing = headers.find((item) => item.enabled && item.key.toLowerCase() === "content-type");
  if (existing) {
    return headers;
  }
  return setKv(headers, "Content-Type", mime, true);
}

export type BuiltBody = {
  body?: string;
  bodyBase64?: boolean;
  headers: WbKv[];
  /** Multipart with file parts must be assembled in the main process. */
  pendingMultipart?: boolean;
};

export function buildBody(body: WbBody, headers: WbKv[]): BuiltBody {
  switch (body.mode) {
    case "none":
      return { headers };
    case "json": {
      const text = body.json ?? body.raw ?? "";
      return { body: text, headers: ensureContentType(headers, "application/json") };
    }
    case "raw": {
      const text = body.raw ?? "";
      const mime =
        body.rawLanguage === "json"
          ? "application/json"
          : body.rawLanguage === "xml"
            ? "application/xml"
            : body.rawLanguage === "html"
              ? "text/html"
              : body.rawLanguage === "javascript"
                ? "application/javascript"
                : "text/plain";
      return { body: text, headers: ensureContentType(headers, mime) };
    }
    case "urlencoded": {
      const text = enabledKv(body.urlencoded ?? [])
        .map((item) => `${encodeURIComponent(item.key)}=${encodeURIComponent(item.value)}`)
        .join("&");
      return {
        body: text,
        headers: ensureContentType(headers, "application/x-www-form-urlencoded"),
      };
    }
    case "graphql": {
      let variables: unknown = {};
      const rawVars = body.graphql?.variables ?? "";
      if (rawVars.trim()) {
        try {
          variables = JSON.parse(rawVars);
        } catch {
          variables = rawVars;
        }
      }
      const text = JSON.stringify({ query: body.graphql?.query ?? "", variables });
      return { body: text, headers: ensureContentType(headers, "application/json") };
    }
    case "binary": {
      if (!body.binary?.base64) {
        return { headers };
      }
      const mime = body.binary.mime || "application/octet-stream";
      return {
        body: body.binary.base64,
        bodyBase64: true,
        headers: ensureContentType(headers, mime),
      };
    }
    case "formdata": {
      const fields = body.formdata ?? [];
      const hasFile = fields.some((item) => item.enabled && item.kind === "file");
      if (hasFile) {
        return { headers, pendingMultipart: true };
      }
      // Text-only multipart, assembled here so snippets still work.
      const boundary = `----LurkwireForm${newId().replace(/-/g, "").slice(0, 16)}`;
      const chunks: string[] = [];
      for (const field of fields) {
        if (!field.enabled || !field.key) {
          continue;
        }
        chunks.push(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.key}"\r\n\r\n${field.value}\r\n`,
        );
      }
      chunks.push(`--${boundary}--\r\n`);
      return {
        body: chunks.join(""),
        headers: setKv(headers, "Content-Type", `multipart/form-data; boundary=${boundary}`, true),
      };
    }
    default:
      return { headers };
  }
}

export type BuiltHttpRequest = {
  method: string;
  url: string;
  headers: HeaderPair[];
  body?: string;
  bodyBase64?: boolean;
  pending?: "digest" | "awsv4" | "multipart";
};

export function buildHttpRequest(
  request: Pick<WbRequest, "method" | "url" | "params" | "headers" | "body" | "auth">,
  collectionAuth?: WbAuth,
): BuiltHttpRequest {
  const auth = resolveAuth(request.auth, collectionAuth);
  const applied = applyAuth(auth, request.headers, buildUrl(request.url, request.params));
  const built = buildBody(request.body, applied.headers);
  const pending = applied.pending ?? (built.pendingMultipart ? "multipart" : undefined);
  return {
    method: request.method || "GET",
    url: applied.url,
    headers: enabledKv(built.headers).map((item) => ({ name: item.key, value: item.value })),
    body: built.body,
    bodyBase64: built.bodyBase64,
    pending,
  };
}

export function toRepeaterSend(built: BuiltHttpRequest, projectId?: string | null): RepeaterSendRequest {
  return {
    project_id: projectId ?? undefined,
    method: built.method,
    url: built.url,
    headers: built.headers,
    body: built.body,
    body_base64: built.bodyBase64,
  };
}

export function requestFromFlow(
  flow: FlowDetail,
  bodyText?: string,
): Omit<WbRequest, "id" | "collectionId" | "updatedAt"> {
  const headers = flow.req_headers
    .filter((item) => !SKIP_FROM_FLOW.has(item.name.toLowerCase()))
    .map((item) => kv(item.name, item.value, true));
  let body = emptyBody();
  const mime = (flow.req_headers.find((item) => item.name.toLowerCase() === "content-type")?.value ?? "").toLowerCase();
  if (bodyText) {
    if (mime.includes("application/json") || looksLikeJson(bodyText)) {
      body = { ...body, mode: "json", json: bodyText, raw: bodyText, rawLanguage: "json" };
    } else if (mime.includes("application/x-www-form-urlencoded")) {
      const fields = bodyText.split("&").filter(Boolean).map((part) => {
        const eq = part.indexOf("=");
        const key = eq === -1 ? part : part.slice(0, eq);
        const value = eq === -1 ? "" : part.slice(eq + 1);
        return kv(decodeURIComponent(key.replace(/\+/g, " ")), decodeURIComponent(value.replace(/\+/g, " ")));
      });
      body = { ...body, mode: "urlencoded", urlencoded: fields };
    } else {
      body = { ...body, mode: "raw", raw: bodyText, rawLanguage: mime.includes("xml") ? "xml" : mime.includes("html") ? "html" : "text" };
    }
  }
  const params: WbKv[] = [];
  if (flow.query) {
    for (const part of flow.query.split("&")) {
      if (!part) {
        continue;
      }
      const eq = part.indexOf("=");
      const key = eq === -1 ? part : part.slice(0, eq);
      const value = eq === -1 ? "" : part.slice(eq + 1);
      params.push(kv(decodeURIComponent(key.replace(/\+/g, " ")), decodeURIComponent(value.replace(/\+/g, " "))));
    }
  }
  const url = flow.query ? flow.url.replace(/\?[^#]*/, "") : flow.url;
  return {
    name: `${flow.method} ${flow.path}`,
    method: flow.method,
    url,
    params,
    headers,
    body,
    auth: emptyAuth("none"),
    folderId: null,
    protocol: "http",
    description: flow.note || undefined,
  };
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

