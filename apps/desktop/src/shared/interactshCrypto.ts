import { constants, createDecipheriv, privateDecrypt } from "node:crypto";

export function decryptAesKey(privateKeyPem: string, encryptedB64: string): Buffer {
  const ciphertext = Buffer.from(encryptedB64, "base64");
  return privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    ciphertext,
  );
}

export function decryptInteraction(aesKeyBuf: Buffer, encryptedB64: string): string {
  const blob = Buffer.from(encryptedB64, "base64");
  if (blob.length <= 16) {
    throw new Error("Encrypted interaction is too short.");
  }
  const iv = blob.subarray(0, 16);
  const data = blob.subarray(16);
  const decipher = createDecipheriv("aes-256-ctr", aesKeyBuf, iv);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain.toString("utf8");
}
