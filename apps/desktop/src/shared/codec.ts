const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function toBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromBytes(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("invalid hex");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array, url = false): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const b64 = btoa(binary);
  return url ? b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") : b64;
}

export function base64ToBytes(input: string): Uint8Array {
  const trimmed = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = trimmed + "=".repeat((4 - (trimmed.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function encodeUrl(text: string): string {
  return encodeURIComponent(text).replace(/%20/g, "+");
}

export function decodeUrl(text: string): string {
  return decodeURIComponent(text.replace(/\+/g, "%20"));
}

const HTML_ENCODE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function encodeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ENCODE[ch] ?? ch);
}

export function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    }
    return HTML_NAMED[body.toLowerCase()] ?? match;
  });
}

export async function digestHex(
  algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512",
  text: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(algorithm, toBytes(text) as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

export function md5Hex(text: string): string {
  return bytesToHex(md5(toBytes(text)));
}

function md5(bytes: Uint8Array): Uint8Array {
  const original = bytes.length;
  const bitLen = original * 8;
  const paddedLen = (((original + 8) >> 6) + 1) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[original] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10,
    15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) {
    k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
  }

  for (let offset = 0; offset < paddedLen; offset += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) {
      m[i] = view.getUint32(offset + i * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const next = (b + rotl((a + f + k[i] + m[g]) >>> 0, s[i])) >>> 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return out;
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

export type CodecId =
  | "url"
  | "base64"
  | "base64url"
  | "hex"
  | "html"
  | "md5"
  | "sha1"
  | "sha256"
  | "sha384"
  | "sha512";

export const CODEC_LABELS: { id: CodecId; label: string; hash?: boolean }[] = [
  { id: "url", label: "URL" },
  { id: "base64", label: "Base64" },
  { id: "base64url", label: "Base64url" },
  { id: "hex", label: "Hex" },
  { id: "html", label: "HTML" },
  { id: "md5", label: "MD5", hash: true },
  { id: "sha1", label: "SHA-1", hash: true },
  { id: "sha256", label: "SHA-256", hash: true },
  { id: "sha384", label: "SHA-384", hash: true },
  { id: "sha512", label: "SHA-512", hash: true },
];

export function encodeCodec(id: CodecId, text: string): string {
  switch (id) {
    case "url":
      return encodeUrl(text);
    case "base64":
      return bytesToBase64(toBytes(text));
    case "base64url":
      return bytesToBase64(toBytes(text), true);
    case "hex":
      return bytesToHex(toBytes(text));
    case "html":
      return encodeHtml(text);
    case "md5":
      return md5Hex(text);
    default:
      throw new Error(`${id} is async; use hashCodec`);
  }
}

export function decodeCodec(id: CodecId, text: string): string {
  switch (id) {
    case "url":
      return decodeUrl(text);
    case "base64":
    case "base64url":
      return fromBytes(base64ToBytes(text));
    case "hex":
      return fromBytes(hexToBytes(text));
    case "html":
      return decodeHtml(text);
    default:
      throw new Error(`${id} cannot be decoded`);
  }
}

export async function hashCodec(id: CodecId, text: string): Promise<string> {
  switch (id) {
    case "md5":
      return md5Hex(text);
    case "sha1":
      return digestHex("SHA-1", text);
    case "sha256":
      return digestHex("SHA-256", text);
    case "sha384":
      return digestHex("SHA-384", text);
    case "sha512":
      return digestHex("SHA-512", text);
    default:
      return encodeCodec(id, text);
  }
}
