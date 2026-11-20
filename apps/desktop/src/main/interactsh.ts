import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import {
  encodeInteractshPublicKey,
  generateCorrelationId,
  generateNonce,
  INTERACTSH_SERVERS,
  parseInteraction,
  payloadUrl,
  type InteractshInteraction,
  type InteractshState,
} from "../shared/interactsh";
import { decryptAesKey, decryptInteraction } from "../shared/interactshCrypto";

export type InteractshSession = {
  server: string;
  correlationId: string;
  secretKey: string;
  privateKeyPem: string;
  registeredAt: number;
};

const DEFAULT_SERVER = INTERACTSH_SERVERS[0];

let session: InteractshSession | null = null;
let aesKey: Buffer | null = null;
let interactions: InteractshInteraction[] = [];
let lastPoll: number | null = null;
let lastError: string | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let currentNonce = generateNonce();

function statePath(): string {
  return join(app.getPath("userData"), "interactsh.json");
}

export function interactshState(): InteractshState {
  return {
    registered: Boolean(session),
    server: session?.server ?? DEFAULT_SERVER,
    correlationId: session?.correlationId ?? null,
    payload: session ? payloadUrl(session.correlationId, currentNonce, session.server) : null,
    lastPoll,
    error: lastError,
    interactions,
  };
}

export function newPayload(): InteractshState {
  currentNonce = generateNonce();
  persist();
  return interactshState();
}

export function loadInteractsh(): InteractshState {
  try {
    const file = statePath();
    if (existsSync(file)) {
      const saved = JSON.parse(readFileSync(file, "utf8")) as {
        session?: InteractshSession;
        nonce?: string;
        interactions?: InteractshInteraction[];
      };
      if (saved.session?.correlationId && saved.session.privateKeyPem) {
        session = saved.session;
        currentNonce = saved.nonce && saved.nonce.length === 13 ? saved.nonce : generateNonce();
        interactions = saved.interactions ?? [];
      }
    }
  } catch {
    session = null;
  }
  if (session) {
    startPolling();
  }
  return interactshState();
}

function persist() {
  if (!session) {
    return;
  }
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(
      statePath(),
      `${JSON.stringify({ session, nonce: currentNonce, interactions }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // ignore disk errors; polling still works in-memory
  }
}

export async function registerInteractsh(server: string = DEFAULT_SERVER): Promise<InteractshState> {
  lastError = null;
  const host = server.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const correlationId = generateCorrelationId();
  const secretKey = globalThis.crypto.randomUUID();
  const publicKeyEncoded = encodeInteractshPublicKey(Uint8Array.from(publicKey));
  const res = await fetch(`https://${host}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Lurkwire interactsh" },
    body: JSON.stringify({
      "public-key": publicKeyEncoded,
      "secret-key": secretKey,
      "correlation-id": correlationId,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Registration failed (${res.status})`);
  }
  session = {
    server: host,
    correlationId,
    secretKey,
    privateKeyPem: privateKey,
    registeredAt: Date.now(),
  };
  aesKey = null;
  interactions = [];
  currentNonce = generateNonce();
  lastPoll = null;
  persist();
  startPolling();
  return interactshState();
}

export async function deregisterInteractsh(): Promise<InteractshState> {
  stopPolling();
  const current = session;
  session = null;
  aesKey = null;
  lastError = null;
  if (current) {
    try {
      await fetch(`https://${current.server}/deregister`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Lurkwire interactsh" },
        body: JSON.stringify({
          "correlation-id": current.correlationId,
          "secret-key": current.secretKey,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // still clear local state
    }
  }
  try {
    if (existsSync(statePath())) {
      writeFileSync(statePath(), "{}\n", "utf8");
    }
  } catch {
    // ignore
  }
  return interactshState();
}

export async function pollInteractsh(): Promise<InteractshState> {
  if (!session) {
    throw new Error("Register with an interactsh server first.");
  }
  const url = `https://${session.server}/poll?id=${encodeURIComponent(session.correlationId)}&secret=${encodeURIComponent(session.secretKey)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Lurkwire interactsh" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: string[];
    extra?: string[];
    aes_key?: string;
    tlddata?: unknown;
    message?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Poll failed (${res.status})`);
  }
  if (body.aes_key && !aesKey) {
    aesKey = decryptAesKey(session.privateKeyPem, body.aes_key);
  }
  const incoming = [...(body.data ?? []), ...(body.extra ?? [])];
  if (incoming.length) {
    if (!aesKey) {
      throw new Error("The server returned interactions before the AES key.");
    }
    for (const item of incoming) {
      const plain = decryptInteraction(aesKey, item);
      const parsed = parseInteraction(plain);
      if (parsed && !interactions.some((row) => row.rawRequest === parsed.rawRequest && row.timestamp === parsed.timestamp && row.protocol === parsed.protocol)) {
        interactions = [parsed, ...interactions].slice(0, 500);
      }
    }
  }
  lastPoll = Date.now();
  lastError = null;
  persist();
  return interactshState();
}


function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    void pollInteractsh().catch((err: unknown) => {
      lastError = err instanceof Error ? err.message : String(err);
    });
  }, 5000);
  void pollInteractsh().catch((err: unknown) => {
    lastError = err instanceof Error ? err.message : String(err);
  });
}

export function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
