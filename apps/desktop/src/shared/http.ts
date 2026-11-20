import type { FlowDetail, HeaderPair, RepeaterSendRequest } from "./types";

export function formatBytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function shortMime(mime: string | null): string {
  if (!mime) {
    return "";
  }
  const [type] = mime.split(";");
  return type.trim();
}

export function statusClass(status: number | null): string {
  if (status === null) {
    return "status-none";
  }
  if (status >= 500) {
    return "status-5xx";
  }
  if (status >= 400) {
    return "status-4xx";
  }
  if (status >= 300) {
    return "status-3xx";
  }
  if (status >= 200) {
    return "status-2xx";
  }
  return "status-none";
}

export function formatHeaders(headers: HeaderPair[]): string {
  return headers.map((header) => `${header.name}: ${header.value}`).join("\n");
}

export function formatRawRequest(flow: FlowDetail): string {
  const path = flow.query ? `${flow.path}?${flow.query}` : flow.path;
  const lines = [`${flow.method} ${path} HTTP/1.1`, formatHeaders(flow.req_headers), ""];
  if (flow.req_preview) {
    lines.push(flow.req_preview);
  }
  return lines.join("\n");
}

export function parseHeaderBlock(text: string): HeaderPair[] {
  const headers: HeaderPair[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const idx = trimmed.indexOf(":");
    if (idx === -1) {
      continue;
    }
    headers.push({
      name: trimmed.slice(0, idx).trim(),
      value: trimmed.slice(idx + 1).trim(),
    });
  }
  return headers;
}

export function parseRawRequest(raw: string, fallbackUrl: string): RepeaterSendRequest {
  const normalized = raw.replace(/\r\n/g, "\n");
  const splitAt = normalized.indexOf("\n\n");
  const head = splitAt === -1 ? normalized : normalized.slice(0, splitAt);
  const body = splitAt === -1 ? "" : normalized.slice(splitAt + 2);
  const lines = head.split("\n");
  const requestLine = lines[0] ?? "";
  const match = requestLine.match(/^([A-Z]+)\s+(\S+)/);
  const method = match?.[1] ?? "GET";
  const path = match?.[2] ?? "/";
  const headers = parseHeaderBlock(lines.slice(1).join("\n"));
  const host = headers.find((header) => header.name.toLowerCase() === "host")?.value;
  let url = fallbackUrl;
  if (!url) {
    const scheme = "https";
    url = host ? `${scheme}://${host}${path}` : path;
  } else {
    try {
      const parsed = new URL(url);
      const [pathname, query] = path.split("?");
      parsed.pathname = pathname || "/";
      parsed.search = query ? `?${query}` : "";
      url = parsed.toString();
    } catch {
      // keep fallback
    }
  }
  return {
    method,
    url,
    headers,
    body: body || undefined,
  };
}

export function seedRawRequest(flow: FlowDetail): { url: string; raw: string } {
  return { url: flow.url, raw: formatRawRequest(flow) };
}


function shellQuote(value: string): string {
  if (value === "") {
    return "''";
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function flowToCurl(flow: Pick<FlowDetail, "method" | "url" | "req_headers">, body?: string): string {
  const parts = ["curl", "--path-as-is", "-X", flow.method, shellQuote(flow.url)];
  for (const header of flow.req_headers) {
    if (header.name.toLowerCase() === "content-length") {
      continue;
    }
    parts.push("-H", shellQuote(`${header.name}: ${header.value}`));
  }
  if (body) {
    parts.push("--data-raw", shellQuote(body));
  }
  return parts.join(" ");
}
