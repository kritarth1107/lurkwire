import type { Finding } from "./types";

const HINTS: Record<string, { explain: string; suggest: string; remediate: string }> = {
  "reflected-xss": {
    explain: "A request parameter appears in the HTML response without encoding, so a script payload can run in the victim's browser.",
    suggest: "Confirm in a lab by submitting a harmless unique marker (for example an innocuous probe string) and checking it is reflected raw. Then try a standard HTML-context probe such as a script or event-handler payload only against hosts in scope.",
    remediate: "HTML-encode untrusted output in the correct context, set a strict Content-Security-Policy, and avoid reflecting raw query values into HTML or JavaScript.",
  },
  "sqli-data": {
    explain: "The request looks like a SQL injection probe and the response contains what appears to be a database dump (repeated rows or password hashes).",
    suggest: "In an authorized lab, compare a baseline request against the probe. Confirm whether additional rows or credential material appear only when the injection syntax is present.",
    remediate: "Use parameterized queries or an ORM, never concatenate untrusted input into SQL, and avoid exposing raw database errors or bulk record dumps to the client.",
  },
  "sql-error": {
    explain: "The response body looks like a database error, which often means user input reached a SQL interpreter unsafely.",
    suggest: "Replay the request with a single quote versus an escaped quote and compare status, length, and error text. Stay on in-scope lab targets.",
    remediate: "Use parameterized queries and return a generic error to clients. Do not include SQL or stack traces in production responses.",
  },
};

const DEFAULT_HINTS = {
  explain: "This is a passive scanner finding. Review the evidence request and response and decide whether the issue is confirmed, informational, or a false positive.",
  suggest: "Send the evidence to Repeater, change one input at a time, and compare the response. Only probe hosts that are in scope.",
  remediate: "Treat the finding as a lead: confirm impact, then apply the usual control for this class (validation, encoding, authentication, or configuration).",
};

export function findingHints(checkId: string): { explain: string; suggest: string; remediate: string } {
  return HINTS[checkId] ?? DEFAULT_HINTS;
}

export function formatFindingForLlm(finding: Finding): string {
  return [
    `Finding: ${finding.title}`,
    `Check: ${finding.check_id}`,
    `Severity: ${finding.severity}`,
    `Request: ${finding.method} ${finding.host}${finding.path}`,
    finding.status != null ? `Status: ${finding.status}` : "",
    `Detail: ${finding.detail}`,
    finding.evidence ? `Evidence:\n${finding.evidence}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function localFindingBrief(finding: Finding, kind: "explain" | "suggest"): string {
  const hints = findingHints(finding.check_id);
  const header = `${finding.title} (${finding.severity}) on ${finding.method} ${finding.host}${finding.path}`;
  if (kind === "suggest") {
    return [
      header,
      "",
      "Suggested next tests:",
      hints.suggest,
      "",
      "Remediation direction:",
      hints.remediate,
      finding.evidence ? `\nEvidence excerpt:\n${finding.evidence.slice(0, 800)}` : "",
    ].join("\n");
  }
  return [
    header,
    "",
    finding.detail,
    "",
    hints.explain,
    "",
    "Remediation:",
    hints.remediate,
    finding.evidence ? `\nEvidence excerpt:\n${finding.evidence.slice(0, 800)}` : "",
  ].join("\n");
}
