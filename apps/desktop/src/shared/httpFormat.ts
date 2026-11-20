import type { HeaderPair } from "./types";

export function prettyBody(text: string, mime: string | null): string {
  const m = (mime ?? "").toLowerCase();
  const trimmed = text.trim();
  if (m.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  if (m.includes("xml") || m.includes("html") || m.includes("svg")) {
    return prettyMarkup(text);
  }
  if (m.includes("x-www-form-urlencoded")) {
    return text
      .split("&")
      .map((part) => {
        try {
          return decodeURIComponent(part.replace(/\+/g, " "));
        } catch {
          return part;
        }
      })
      .join("\n");
  }
  return text;
}

function tagName(line: string): string {
  const match = /^<\/?([a-zA-Z0-9:-]+)/.exec(line);
  return match ? match[1].toLowerCase() : "";
}

function prettyMarkup(src: string): string {
  const tokens = src.replace(/>\s*</g, ">\n<").split("\n");
  let indent = 0;
  const out: string[] = [];
  const voids = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  for (const raw of tokens) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    const closing = line.startsWith("</");
    if (closing) {
      indent = Math.max(0, indent - 1);
    }
    out.push(`${"  ".repeat(indent)}${line}`);
    const name = tagName(line);
    const opening = line.startsWith("<") && !closing && !line.startsWith("<!") && !line.startsWith("<?") && !line.endsWith("/>") && !voids.has(name);
    if (opening && !line.includes("</")) {
      indent += 1;
    }
  }
  return out.join("\n");
}

export function toHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.subarray(i, i + 16);
    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ")
      .padEnd(47, " ");
    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");
    lines.push(`${i.toString(16).padStart(8, "0")}  ${hex}  ${ascii}`);
  }
  return lines.join("\n") || "(empty)";
}

export function formatHeaders(headers: HeaderPair[]): string {
  return headers.map((h) => `${h.name}: ${h.value}`).join("\n");
}

export function languageFor(mime: string | null, text: string): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    return "json";
  }
  if (m.includes("html")) {
    return "html";
  }
  if (m.includes("xml") || m.includes("svg")) {
    return "xml";
  }
  if (m.includes("css")) {
    return "css";
  }
  if (m.includes("javascript") || m.includes("ecmascript")) {
    return "javascript";
  }
  return "plaintext";
}

export function headerMime(headers: HeaderPair[]): string | null {
  const found = headers.find((h) => h.name.toLowerCase() === "content-type");
  return found?.value ?? null;
}

export function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function headerValue(headers: HeaderPair[], name: string): string | null {
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found?.value ?? null;
}

export function charsetFromContentType(contentType: string | null | undefined): string | null {
  if (!contentType) {
    return null;
  }
  for (const part of contentType.split(";").slice(1)) {
    const [key, ...rest] = part.split("=");
    if (key?.trim().toLowerCase() !== "charset") {
      continue;
    }
    const raw = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (raw) {
      return raw;
    }
  }
  return null;
}

export function charsetFromHtml(bytes: Uint8Array): string | null {
  const prefix = bytes.subarray(0, Math.min(bytes.length, 2048));
  const ascii = new TextDecoder("latin1").decode(prefix).toLowerCase();
  const idx = ascii.indexOf("charset=");
  if (idx < 0) {
    return null;
  }
  let rest = ascii.slice(idx + 8).replace(/^["'\s]+/, "");
  const match = /^[a-z0-9_-]+/.exec(rest);
  return match ? match[0] : null;
}

export function charsetFromBom(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }
  return null;
}

export function resolveCharset(bytes: Uint8Array, headers: HeaderPair[], mime?: string | null): string {
  return (
    charsetFromBom(bytes) ??
    charsetFromContentType(headerValue(headers, "content-type") ?? mime ?? null) ??
    charsetFromHtml(bytes) ??
    "utf-8"
  );
}

export function decodeText(bytes: Uint8Array, headers: HeaderPair[] = [], mime?: string | null): string {
  if (!bytes.length) {
    return "";
  }
  const label = resolveCharset(bytes, headers, mime);
  try {
    const text = new TextDecoder(label, { fatal: false }).decode(bytes);
    if (label.toLowerCase() === "utf-8" && !charsetFromBom(bytes) && !charsetFromContentType(headerValue(headers, "content-type") ?? mime ?? null)) {
      // If UTF-8 was assumed and the body is mostly replacement characters, try windows-1252.
      const replacements = (text.match(/\uFFFD/g) ?? []).length;
      if (replacements > 0 && replacements * 8 > text.length) {
        return new TextDecoder("windows-1252").decode(bytes);
      }
    }
    return text;
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
