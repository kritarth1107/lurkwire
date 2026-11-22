import type { FlowDetail, PausedItem } from "../../shared/types";

export function pausedToFlowDetail(item: PausedItem, projectId: string | null): FlowDetail {
  let host = "";
  let path = "/";
  let query = "";
  let scheme = "https";
  let port = 443;
  try {
    const parsed = new URL(item.url);
    host = parsed.hostname;
    path = parsed.pathname || "/";
    query = parsed.search.startsWith("?") ? parsed.search.slice(1) : parsed.search;
    scheme = parsed.protocol.replace(":", "") || "https";
    port = parsed.port ? Number(parsed.port) : scheme === "http" ? 80 : 443;
  } catch {
    host = item.url;
  }
  const request = item.direction === "request";
  return {
    id: item.id,
    project_id: projectId ?? "",
    ts: item.created_at,
    method: item.method,
    scheme,
    host,
    port,
    path,
    query,
    url: item.url,
    http_version: "HTTP/1.1",
    status: item.status,
    req_len: request ? item.body_len : 0,
    resp_len: request ? 0 : item.body_len,
    duration_ms: null,
    source: "intercept",
    mime: null,
    in_scope: true,
    truncated: false,
    tags: [],
    note: "",
    req_headers: request ? item.headers : [],
    resp_headers: request ? [] : item.headers,
    req_blob: request ? item.body : null,
    resp_blob: request ? null : item.body,
    req_preview: request ? item.body : null,
    resp_preview: request ? null : item.body,
  };
}
