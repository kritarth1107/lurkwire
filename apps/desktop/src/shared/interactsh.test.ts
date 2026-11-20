import { createCipheriv, generateKeyPairSync, publicEncrypt, constants } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encodeInteractshPublicKey,
  generateCorrelationId,
  generateNonce,
  isCorrelationId,
  parseInteraction,
  payloadHost,
  payloadUrl,
  XID_ALPHABET,
} from "./interactsh";
import { decryptAesKey, decryptInteraction } from "./interactshCrypto";

describe("interactsh identifiers", () => {
  it("generates a 20-character xid correlation id and a 13-character nonce", () => {
    const cid = generateCorrelationId();
    const nonce = generateNonce();
    expect(isCorrelationId(cid)).toBe(true);
    expect(nonce).toHaveLength(13);
    expect([...nonce].every((ch) => XID_ALPHABET.includes(ch))).toBe(true);
  });

  it("builds the official payload host shape", () => {
    const cid = "0123456789abcdefghij";
    const nonce = "klmnopqrstuvw";
    expect(payloadHost(cid, nonce, "oast.pro")).toBe("0123456789abcdefghijklmnopqrstuvw.oast.pro");
    expect(payloadUrl(cid, nonce, "oast.pro")).toBe("http://0123456789abcdefghijklmnopqrstuvw.oast.pro/");
  });
});

describe("interactsh cryptography", () => {
  it("encodes the public key as base64 of an RSA PUBLIC KEY SPKI PEM", () => {
    const { publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "der" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const encoded = encodeInteractshPublicKey(Uint8Array.from(publicKey));
    const pem = Buffer.from(encoded, "base64").toString("utf8");
    expect(pem).toContain("BEGIN RSA PUBLIC KEY");
    expect(pem).toContain("END RSA PUBLIC KEY");
    expect(pem).not.toContain("BEGIN PUBLIC KEY");
  });

  it("unwraps the AES key with RSA-OAEP SHA-256 and decrypts AES-CTR with a prepended IV", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const aesKey = Buffer.alloc(32, 7);
    const encryptedKey = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      aesKey,
    ).toString("base64");
    expect(decryptAesKey(privateKey, encryptedKey).equals(aesKey)).toBe(true);

    const iv = Buffer.alloc(16, 3);
    const cipher = createCipheriv("aes-256-ctr", aesKey, iv);
    const json = JSON.stringify({
      protocol: "dns",
      "unique-id": "abc",
      "full-id": "full",
      "raw-request": "A IN example.",
      "remote-address": "1.2.3.4",
      timestamp: "2026-01-01T00:00:00Z",
    });
    const blob = Buffer.concat([iv, cipher.update(json, "utf8"), cipher.final()]).toString("base64");
    const plain = decryptInteraction(aesKey, blob);
    const parsed = parseInteraction(plain);
    expect(parsed?.protocol).toBe("dns");
    expect(parsed?.remoteAddress).toBe("1.2.3.4");
    expect(parsed?.rawRequest).toContain("A IN");
  });
});
