import { base64ToBytes, bytesToBase64, fromBytes, toBytes } from "./codec";

export type JwtAlg = "HS256" | "HS384" | "HS512" | "none";

export type JwtClaimTimes = {
  iat?: string;
  nbf?: string;
  exp?: string;
};

export type DecodedJwt = {
  token: string;
  headerText: string;
  payloadText: string;
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  alg: string;
  claims: JwtClaimTimes;
};

const JWT_RE =
  /eyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]*?\.[A-Za-z0-9_-]*/g;

export function isJwtLike(text: string): boolean {
  const parts = text.trim().split(".");
  return parts.length === 3 && parts[0]!.startsWith("eyJ");
}

export function extractJwts(text: string): string[] {
  const found = text.match(JWT_RE) ?? [];
  return [...new Set(found)];
}

function b64urlJson(value: unknown): string {
  return bytesToBase64(toBytes(JSON.stringify(value)), true);
}

function parsePart(raw: string): { text: string; json: Record<string, unknown> } {
  const text = fromBytes(base64ToBytes(raw));
  const json = JSON.parse(text) as unknown;
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("JWT part is not a JSON object");
  }
  return { text: JSON.stringify(json, null, 2), json: json as Record<string, unknown> };
}

function formatEpoch(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return new Date(value * 1000).toISOString();
}

export function decodeJwt(token: string): DecodedJwt {
  const trimmed = token.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    throw new Error("JWT must have three parts");
  }
  const header = parsePart(parts[0]!);
  const payload = parsePart(parts[1]!);
  const alg = typeof header.json.alg === "string" ? header.json.alg : "";
  return {
    token: trimmed,
    headerText: header.text,
    payloadText: payload.text,
    header: header.json,
    payload: payload.json,
    signature: parts[2] ?? "",
    alg,
    claims: {
      iat: formatEpoch(payload.json.iat),
      nbf: formatEpoch(payload.json.nbf),
      exp: formatEpoch(payload.json.exp),
    },
  };
}

function hashForAlg(alg: JwtAlg): "SHA-256" | "SHA-384" | "SHA-512" | null {
  switch (alg) {
    case "HS256":
      return "SHA-256";
    case "HS384":
      return "SHA-384";
    case "HS512":
      return "SHA-512";
    case "none":
      return null;
  }
}

async function hmac(alg: "SHA-256" | "SHA-384" | "SHA-512", secret: string, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    toBytes(secret) as BufferSource,
    { name: "HMAC", hash: alg },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, data as BufferSource);
  return new Uint8Array(signature);
}

function parseJsonObject(text: string, label: string): Record<string, unknown> {
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export async function signJwt(
  headerText: string,
  payloadText: string,
  secret: string,
  alg: JwtAlg,
): Promise<string> {
  const header = { ...parseJsonObject(headerText, "header"), alg, typ: "JWT" };
  if (alg === "none") {
    header.alg = "none";
  }
  const payload = parseJsonObject(payloadText, "payload");
  const body = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  if (alg === "none") {
    return `${body}.`;
  }
  if (!secret) {
    throw new Error("a secret is required to sign with HMAC");
  }
  const hash = hashForAlg(alg);
  if (!hash) {
    throw new Error(`unsupported alg ${alg}`);
  }
  const signature = await hmac(hash, secret, toBytes(body));
  return `${body}.${bytesToBase64(signature, true)}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
): Promise<{ ok: boolean; alg: string; reason?: string }> {
  const decoded = decodeJwt(token);
  const alg = decoded.alg;
  if (alg === "none") {
    return {
      ok: decoded.signature.length === 0,
      alg,
      reason: decoded.signature.length === 0 ? undefined : "alg none should have an empty signature",
    };
  }
  if (alg !== "HS256" && alg !== "HS384" && alg !== "HS512") {
    return { ok: false, alg, reason: `verification for ${alg || "unknown alg"} is not supported` };
  }
  if (!secret) {
    return { ok: false, alg, reason: "enter the HMAC secret to verify" };
  }
  const body = token.trim().split(".").slice(0, 2).join(".");
  const expected = await hmac(hashForAlg(alg)!, secret, toBytes(body));
  const actual = base64ToBytes(decoded.signature);
  if (expected.length !== actual.length) {
    return { ok: false, alg, reason: "signature does not match" };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected[i]! ^ actual[i]!;
  }
  return diff === 0 ? { ok: true, alg } : { ok: false, alg, reason: "signature does not match" };
}

export function unsignedJwt(headerText: string, payloadText: string): string {
  const header = { ...parseJsonObject(headerText, "header"), alg: "none", typ: "JWT" };
  const payload = parseJsonObject(payloadText, "payload");
  return `${b64urlJson(header)}.${b64urlJson(payload)}.`;
}
