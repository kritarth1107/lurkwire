import { createHash, createHmac } from "node:crypto";
import type { HeaderPair } from "../../shared/types";
import type { WbAwsV4 } from "../../shared/workbench";

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalQuery(url: URL): string {
  const pairs: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    pairs.push([key, value]);
  });
  pairs.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  return pairs.map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`).join("&");
}

export function signAwsV4(
  method: string,
  url: string,
  headers: HeaderPair[],
  body: Buffer,
  auth: WbAwsV4,
  now = new Date(),
): HeaderPair[] {
  const parsed = new URL(url);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const existing = new Map(headers.map((item) => [item.name.toLowerCase(), item.value]));
  existing.set("host", parsed.host);
  existing.set("x-amz-date", amzDate);
  existing.set("x-amz-content-sha256", payloadHash);
  if (auth.sessionToken) {
    existing.set("x-amz-security-token", auth.sessionToken);
  }

  const signedNames = [...existing.keys()].filter((name) => name !== "authorization").sort();
  const canonicalHeaders = signedNames.map((name) => `${name}:${existing.get(name)?.trim()}\n`).join("");
  const signedHeaders = signedNames.join(";");
  const canonicalRequest = [
    method.toUpperCase(),
    parsed.pathname || "/",
    canonicalQuery(parsed),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const region = auth.region || "us-east-1";
  const service = auth.service || "execute-api";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${auth.secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${auth.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const next: HeaderPair[] = [];
  const skip = new Set(["authorization", "host", "x-amz-date", "x-amz-content-sha256", "x-amz-security-token"]);
  for (const header of headers) {
    if (!skip.has(header.name.toLowerCase())) {
      next.push(header);
    }
  }
  next.push({ name: "Host", value: parsed.host });
  next.push({ name: "X-Amz-Date", value: amzDate });
  next.push({ name: "X-Amz-Content-Sha256", value: payloadHash });
  if (auth.sessionToken) {
    next.push({ name: "X-Amz-Security-Token", value: auth.sessionToken });
  }
  next.push({ name: "Authorization", value: authorization });
  return next;
}
