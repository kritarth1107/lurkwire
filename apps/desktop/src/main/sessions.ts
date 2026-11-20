import { createHash } from "node:crypto";
import type { Certificate, Session } from "electron";
import { fingerprintsMatch } from "../shared/fingerprint";

export async function configureProjectSession(
  ses: Session,
  proxyListen: string,
  caFingerprint: string,
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
  await ses.setProxy({
    proxyRules: `http=${proxyHost}:${proxyPort};https=${proxyHost}:${proxyPort}`,
    proxyBypassRules: "<-loopback>",
  });
  trustCaOnlyInsideApp(ses, caFingerprint);
}

export function trustCaOnlyInsideApp(ses: Session, caFingerprint: string): void {
  ses.setCertificateVerifyProc((request, callback) => {
    if (issuedByInstallCa(request, caFingerprint)) {
      callback(0);
      return;
    }
    // Defer to Chromium for anything not signed by the per-install CA.
    callback(-2);
  });
}

export function issuedByInstallCa(
  request: { certificate: Certificate },
  caFingerprint: string,
): boolean {
  const fingerprints = collectFingerprints(request.certificate);
  return fingerprints.some((value) => fingerprintsMatch(value, caFingerprint));
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
