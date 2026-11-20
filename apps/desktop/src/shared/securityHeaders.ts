import type { HeaderPair } from "./types";

export type HeaderSeverity = "info" | "low" | "medium" | "high";

export type HeaderFinding = {
  id: string;
  severity: HeaderSeverity;
  title: string;
  detail: string;
};

function headerMap(headers: HeaderPair[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of headers) {
    const key = item.name.toLowerCase();
    const prev = map.get(key);
    map.set(key, prev ? `${prev}\n${item.value}` : item.value);
  }
  return map;
}

function parseCsp(value: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens[0]) {
      continue;
    }
    out[tokens[0].toLowerCase()] = tokens.slice(1);
  }
  return out;
}

export type SecurityHeaderReport = {
  findings: HeaderFinding[];
  present: Record<string, string>;
  missing: string[];
  csp?: Record<string, string[]>;
};

const EXPECTED = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
];

export function analyzeSecurityHeaders(headers: HeaderPair[], url?: string): SecurityHeaderReport {
  const map = headerMap(headers);
  const findings: HeaderFinding[] = [];
  const present: Record<string, string> = {};
  for (const [key, value] of map) {
    present[key] = value;
  }
  const missing = EXPECTED.filter((name) => !map.has(name));
  const https = url ? url.startsWith("https:") : true;

  if (!map.has("content-security-policy")) {
    findings.push({
      id: "missing-csp",
      severity: "medium",
      title: "No Content-Security-Policy",
      detail: "HTML without a CSP is easier to exploit with XSS or content injection.",
    });
  } else {
    const csp = parseCsp(map.get("content-security-policy") ?? "");
    const script = csp["script-src"] ?? csp["default-src"] ?? [];
    if (script.includes("'unsafe-inline'") || script.includes("'unsafe-eval'")) {
      findings.push({
        id: "csp-unsafe-script",
        severity: "medium",
        title: "CSP allows unsafe script sources",
        detail: `script-src/default-src includes ${script.filter((item) => item.startsWith("'unsafe")).join(", ") || "unsafe tokens"}.`,
      });
    }
    if (!(csp["frame-ancestors"] || []).length && !map.has("x-frame-options")) {
      findings.push({
        id: "clickjacking",
        severity: "low",
        title: "No frame-ancestors or X-Frame-Options",
        detail: "The page may be embeddable in a clickjacking frame.",
      });
    }
  }

  if (https && !map.has("strict-transport-security")) {
    findings.push({
      id: "missing-hsts",
      severity: "low",
      title: "No Strict-Transport-Security",
      detail: "Browsers will not automatically upgrade later HTTP visits to HTTPS.",
    });
  }

  if (!map.has("x-content-type-options")) {
    findings.push({
      id: "missing-xcto",
      severity: "low",
      title: "No X-Content-Type-Options",
      detail: 'Missing "nosniff" lets some browsers MIME-sniff responses.',
    });
  }

  const acao = map.get("access-control-allow-origin");
  const acac = (map.get("access-control-allow-credentials") ?? "").toLowerCase() === "true";
  if (acao === "*") {
    findings.push({
      id: acac ? "cors-wildcard-credentials" : "cors-wildcard",
      severity: acac ? "high" : "info",
      title: acac ? "CORS wildcard with credentials" : "CORS allows any origin",
      detail: acac
        ? "Access-Control-Allow-Origin: * together with credentials is invalid and may hide a messy policy."
        : "Any origin can read this response if the request was made without credentials.",
    });
  }

  for (const [name, value] of map) {
    if (name !== "set-cookie") {
      continue;
    }
    for (const cookie of value.split("\n")) {
      const lower = cookie.toLowerCase();
      const cookieName = cookie.split("=")[0] ?? "cookie";
      if (https && !lower.includes("secure")) {
        findings.push({
          id: "cookie-not-secure",
          severity: "medium",
          title: `Cookie ${cookieName} is missing Secure`,
          detail: cookie,
        });
      }
      if (!lower.includes("httponly")) {
        findings.push({
          id: "cookie-not-httponly",
          severity: "low",
          title: `Cookie ${cookieName} is missing HttpOnly`,
          detail: cookie,
        });
      }
      if (!lower.includes("samesite")) {
        findings.push({
          id: "cookie-not-samesite",
          severity: "medium",
          title: `Cookie ${cookieName} is missing SameSite`,
          detail: "Without SameSite, the cookie may be sent on cross-site CSRF requests.",
        });
      }
    }
  }

  return {
    findings,
    present,
    missing,
    csp: map.has("content-security-policy") ? parseCsp(map.get("content-security-policy") ?? "") : undefined,
  };
}


export function formatSecurityReport(report: SecurityHeaderReport, url?: string): string {
  const lines = [
    "# Security header report",
    url ? `Target: ${url}` : "",
    "",
    "## Findings",
  ].filter((item) => item !== undefined);
  if (report.findings.length === 0) {
    lines.push("No issues flagged.");
  }
  for (const finding of report.findings) {
    lines.push(`- **${finding.severity.toUpperCase()}** ${finding.title} (${finding.id}): ${finding.detail}`);
  }
  if (report.missing.length) {
    lines.push("", "## Missing recommended headers");
    for (const name of report.missing) {
      lines.push(`- ${name}`);
    }
  }
  return lines.filter((item, index) => item !== "" || lines[index - 1] !== "").join("\n") + "\n";
}
