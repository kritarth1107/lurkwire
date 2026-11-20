import { createHash, X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Certificate, Session } from "electron";
import { fingerprintsMatch } from "../shared/fingerprint";
import { handleLurkwireProtocol } from "./internal-protocol";

export async function configureProjectSession(
  ses: Session,
  proxyListen: string,
  caFingerprint: string,
  caPath?: string,
): Promise<void> {
  const host = proxyListen.includes("://")
    ? proxyListen
    : `http://${proxyListen}`;
  const url = new URL(host.startsWith("http") ? host : `http://${proxyListen}`);
  const proxyHost = url.hostname === "::1" ? "[::1]" : url.hostname;
  const proxyPort = url.port;
  // Fail closed: always point at the sidecar. If it is down, Chromium errors
  // instead of leaking traffic direct. <-loopback> sends localhost through
  // the proxy as well so local targets are captured.
  handleLurkwireProtocol(ses);
  await ses.setProxy({
    proxyRules: `http=${proxyHost}:${proxyPort};https=${proxyHost}:${proxyPort}`,
    proxyBypassRules: "<-loopback>",
  });
  const caPem = caPath ? readFileSync(caPath, "utf8") : "";
  trustCaOnlyInsideApp(ses, caFingerprint, caPem);
}

export function trustCaOnlyInsideApp(ses: Session, caFingerprint: string, caPem = ""): void {
  ses.setCertificateVerifyProc((request, callback) => {
    if (issuedByInstallCa(request, caFingerprint, caPem)) {
      callback(0);
      return;
    }
    // Defer to Chromium for anything not signed by the per-install CA.
    callback(-3);
  });
}

export function issuedByInstallCa(
  request: { certificate: Certificate },
  caFingerprint: string,
  caPem = "",
): boolean {
  const fingerprints = collectFingerprints(request.certificate);
  if (fingerprints.some((value) => fingerprintsMatch(value, caFingerprint))) {
    return true;
  }
  if (!caPem) {
    return false;
  }
  try {
    const leaf = new X509Certificate(request.certificate.data);
    const ca = new X509Certificate(caPem);
    return leaf.verify(ca.publicKey);
  } catch {
    return false;
  }
}

function collectFingerprints(cert: Certificate | undefined): string[] {
  const values: string[] = [];
  const seen = new Set<object>();
  let current: Certificate | undefined = cert;
  while (current && !seen.has(current)) {
    seen.add(current);
    values.push(sha256FromPem(current.data));
    if (current.fingerprint) {
      values.push(current.fingerprint);
    }
    current = current.issuerCert;
  }
  return values;
}

export function sha256FromPem(pem: string): string {
  const der = Buffer.from(
    pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    "base64",
  );
  return createHash("sha256").update(der).digest("hex");
}
