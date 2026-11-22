import { decodeCodec, decodeHtml, decodeUrl } from "./codec";
import { decodeJwt, isJwtLike } from "./jwt";

export type DecodeStep = {
  codec: string;
  output: string;
  note?: string;
};

export type HashGuess = {
  alg: string;
  reason: string;
};

const HEX = /^[0-9a-fA-F]+$/;

export function identifyHash(input: string): HashGuess[] {
  const trimmed = input.trim();
  const guesses: HashGuess[] = [];
  if (!trimmed) {
    return guesses;
  }
  if (trimmed.startsWith("$2a$") || trimmed.startsWith("$2b$") || trimmed.startsWith("$2y$")) {
    guesses.push({ alg: "bcrypt", reason: "Modular crypt prefix $2a/$2b/$2y" });
  }
  if (trimmed.startsWith("$argon2")) {
    guesses.push({ alg: "argon2", reason: "Argon2 modular crypt prefix" });
  }
  if (HEX.test(trimmed) && trimmed.length % 2 === 0) {
    if (trimmed.length === 32) {
      guesses.push({ alg: "md5", reason: "32 hex characters" });
    }
    if (trimmed.length === 40) {
      guesses.push({ alg: "sha1", reason: "40 hex characters" });
    }
    if (trimmed.length === 64) {
      guesses.push({ alg: "sha256", reason: "64 hex characters" });
    }
    if (trimmed.length === 96) {
      guesses.push({ alg: "sha384", reason: "96 hex characters" });
    }
    if (trimmed.length === 128) {
      guesses.push({ alg: "sha512", reason: "128 hex characters" });
    }
  }
  return guesses;
}

function tryDecode(codec: "url" | "html" | "base64" | "base64url" | "hex", input: string): string | null {
  try {
    const out = decodeCodec(codec, input);
    if (!out || out === input) {
      return null;
    }
    // Reject obvious binary garbage for base64/hex unless it still looks like text.
    if ((codec === "base64" || codec === "base64url" || codec === "hex") && /[\u0000-\u0008]/.test(out)) {
      return null;
    }
    return out;
  } catch {
    return null;
  }
}

/** Keep decoding until the value stops changing or a loop is detected. */
export function decodeAll(input: string, maxSteps = 8): DecodeStep[] {
  const steps: DecodeStep[] = [];
  let current = input;
  const seen = new Set<string>([input]);
  for (let i = 0; i < maxSteps; i += 1) {
    if (isJwtLike(current)) {
      try {
        const jwt = decodeJwt(current);
        const output = jwt.payloadText || current;
        steps.push({ codec: "jwt", output, note: jwt.alg ? `alg=${jwt.alg}` : undefined });
        if (seen.has(output)) {
          break;
        }
        seen.add(output);
        current = output;
        continue;
      } catch {
        // not a complete JWT
      }
    }
    const html = decodeHtml(current);
    const url = decodeUrl(current);
    const candidates: Array<{ codec: DecodeStep["codec"]; output: string | null }> = [
      { codec: "url", output: url !== current ? url : null },
      { codec: "html", output: html !== current ? html : null },
      { codec: "base64", output: tryDecode("base64", current) },
      { codec: "base64url", output: tryDecode("base64url", current) },
      { codec: "hex", output: tryDecode("hex", current) },
    ];
    const hit = candidates.find((item) => item.output && !seen.has(item.output));
    if (!hit?.output) {
      break;
    }
    steps.push({ codec: hit.codec, output: hit.output });
    seen.add(hit.output);
    current = hit.output;
  }
  return steps;
}
