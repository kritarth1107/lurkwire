import type { Finding } from "./types";
import type { FindingNote, NotesStore } from "./notes";
import { formatCvssVector } from "./cvss";

export type ReportInput = {
  product: string;
  generatedAt: number;
  projectName?: string;
  findings: Finding[];
  notes: FindingNote[];
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bySeverity<T extends { severity: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity as (typeof SEVERITY_ORDER)[number]) - SEVERITY_ORDER.indexOf(b.severity as (typeof SEVERITY_ORDER)[number]));
}

export function findingsReportMarkdown(input: ReportInput): string {
  const when = new Date(input.generatedAt).toISOString();
  const findings = bySeverity(input.findings);
  const notes = bySeverity(input.notes);
  const lines = [
    `# ${input.product} findings report`,
    "",
    input.projectName ? `Project: ${input.projectName}` : "",
    `Generated: ${when}`,
    "",
    `## Scanner findings (${findings.length})`,
    "",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  if (!findings.length) {
    lines.push("_No scanner findings in this project._", "");
  }
  for (const item of findings) {
    lines.push(`### ${item.title}`, "");
    lines.push(`- Severity: **${item.severity}**`);
    lines.push(`- Endpoint: \`${item.method} ${item.host}${item.path}\``);
    if (item.status != null) {
      lines.push(`- Status: ${item.status}`);
    }
    if (item.count > 1) {
      lines.push(`- Seen: ${item.count} times`);
    }
    lines.push("", item.detail, "");
    if (item.evidence) {
      lines.push("```", item.evidence, "```", "");
    }
  }
  lines.push(`## Notes (${notes.length})`, "");
  if (!notes.length) {
    lines.push("_No notes yet._", "");
  }
  for (const note of notes) {
    const score = note.cvssScore != null ? ` · CVSS ${note.cvssScore}` : "";
    lines.push(`### ${note.title}`, "");
    lines.push(`- Severity: **${note.severity}**${score}`);
    if (note.cvss) {
      lines.push(`- Vector: \`${note.cvssVector || formatCvssVector(note.cvss)}\``);
    }
    if (note.host) {
      lines.push(`- Host: ${note.method ?? ""} ${note.host}${note.path ?? ""}`.trim());
    }
    if (note.tags.length) {
      lines.push(`- Tags: ${note.tags.join(", ")}`);
    }
    lines.push("", note.body, "");
  }
  return lines.join("\n").trim() + "\n";
}

export function findingsReportHtml(input: ReportInput): string {
  const findings = bySeverity(input.findings);
  const notes = bySeverity(input.notes);
  const findingHtml = findings
    .map(
      (item) => `
      <article class="finding sev-${escapeHtml(item.severity)}">
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta"><span class="sev">${escapeHtml(item.severity)}</span> · ${escapeHtml(item.method)} ${escapeHtml(item.host)}${escapeHtml(item.path)}${item.status != null ? ` · ${item.status}` : ""}</p>
        <p>${escapeHtml(item.detail)}</p>
        ${item.evidence ? `<pre>${escapeHtml(item.evidence)}</pre>` : ""}
      </article>`,
    )
    .join("\n");
  const noteHtml = notes
    .map(
      (note) => `
      <article class="note sev-${escapeHtml(note.severity)}">
        <h3>${escapeHtml(note.title)}</h3>
        <p class="meta"><span class="sev">${escapeHtml(note.severity)}</span>${note.cvssScore != null ? ` · CVSS ${note.cvssScore}` : ""}</p>
        <pre>${escapeHtml(note.body)}</pre>
      </article>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.product)} findings report</title>
  <style>
    body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 860px; color: #15141a; }
    h1, h2, h3 { line-height: 1.25; }
    .meta { color: #5b5b66; }
    .sev { font-weight: 700; text-transform: uppercase; font-size: 12px; }
    .sev-high, .sev-critical { border-left: 4px solid #c50042; padding-left: 12px; }
    .sev-medium { border-left: 4px solid #c45a11; padding-left: 12px; }
    .sev-low, .sev-info { border-left: 4px solid #5b5b66; padding-left: 12px; }
    pre { background: #f0f0f4; padding: 12px; overflow: auto; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(input.product)} findings report</h1>
  <p class="meta">${input.projectName ? `${escapeHtml(input.projectName)} · ` : ""}Generated ${escapeHtml(new Date(input.generatedAt).toISOString())}</p>
  <h2>Scanner findings (${findings.length})</h2>
  ${findingHtml || "<p>No scanner findings in this project.</p>"}
  <h2>Notes (${notes.length})</h2>
  ${noteHtml || "<p>No notes yet.</p>"}
</body>
</html>
`;
}

export function reportFromStores(input: {
  product: string;
  projectName?: string;
  findings: Finding[];
  notes: NotesStore;
  generatedAt?: number;
}): { markdown: string; html: string } {
  const payload: ReportInput = {
    product: input.product,
    generatedAt: input.generatedAt ?? Date.now(),
    projectName: input.projectName,
    findings: input.findings,
    notes: input.notes.notes,
  };
  return { markdown: findingsReportMarkdown(payload), html: findingsReportHtml(payload) };
}
