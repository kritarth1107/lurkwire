export const INTERACTSH_SERVERS = [
  "oast.pro",
  "oast.live",
  "oast.site",
  "oast.online",
  "oast.fun",
  "oast.me",
] as const;

export const XID_ALPHABET = "0123456789abcdefghijklmnopqrstuv";

export type InteractshServer = (typeof INTERACTSH_SERVERS)[number] | string;

export type InteractshState = {
  registered: boolean;
  server: string;
  correlationId: string | null;
  payload: string | null;
  lastPoll: number | null;
  error: string | null;
  interactions: InteractshInteraction[];
};

export type InteractshInteraction = {
  protocol: string;
  uniqueId: string;
  fullId: string;
  rawRequest: string;
  rawResponse: string;
  remoteAddress: string;
  timestamp: string;
  qType?: string;
  smtpFrom?: string;
};

export function randomXid(length: number, random: (size: number) => Uint8Array = defaultRandom): string {
  const bytes = random(length);
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += XID_ALPHABET[bytes[i] % XID_ALPHABET.length];
  }
  return out;
}

export function generateCorrelationId(random?: (size: number) => Uint8Array): string {
  return randomXid(20, random);
}

export function generateNonce(random?: (size: number) => Uint8Array): string {
  return randomXid(13, random);
}

export function isCorrelationId(value: string): boolean {
  return value.length === 20 && [...value].every((ch) => XID_ALPHABET.includes(ch));
}

export function payloadHost(correlationId: string, nonce: string, serverHost: string): string {
  return `${correlationId}${nonce}.${serverHost}`;
}

export function payloadUrl(correlationId: string, nonce: string, serverHost: string): string {
  return `http://${payloadHost(correlationId, nonce, serverHost)}/`;
}

/** Official interactsh encoding: base64 of a PEM block typed "RSA PUBLIC KEY" whose body is PKIX/SPKI, not PKCS#1. */
export function encodeInteractshPublicKey(spkiDer: Uint8Array): string {
  const b64 = Buffer.from(spkiDer).toString("base64");
  const wrapped = b64.replace(/(.{64})/g, "$1\n").trim();
  const pem = `-----BEGIN RSA PUBLIC KEY-----\n${wrapped}\n-----END RSA PUBLIC KEY-----\n`;
  return Buffer.from(pem, "utf8").toString("base64");
}

export function parseInteractions(rawItems: string[]): InteractshInteraction[] {
  const out: InteractshInteraction[] = [];
  for (const item of rawItems) {
    const parsed = parseInteraction(item);
    if (parsed) {
      out.push(parsed);
    }
  }
  return out;
}

export function parseInteraction(plaintext: string): InteractshInteraction | null {
  try {
    const rec = JSON.parse(plaintext) as Record<string, unknown>;
    return {
      protocol: str(rec.protocol),
      uniqueId: str(rec["unique-id"] ?? rec.uniqueId),
      fullId: str(rec["full-id"] ?? rec.fullId),
      rawRequest: str(rec["raw-request"] ?? rec.rawRequest),
      rawResponse: str(rec["raw-response"] ?? rec.rawResponse),
      remoteAddress: str(rec["remote-address"] ?? rec.remoteAddress),
      timestamp: str(rec.timestamp),
      qType: rec["q-type"] ? str(rec["q-type"]) : undefined,
      smtpFrom: rec["smtp-from"] ? str(rec["smtp-from"]) : undefined,
    };
  } catch {
    return null;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function defaultRandom(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
