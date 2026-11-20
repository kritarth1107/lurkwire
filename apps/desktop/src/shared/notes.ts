import type { Finding } from "./types";
import { scoreCvss, type CvssVector, DEFAULT_CVSS, formatCvssVector } from "./cvss";

export type NoteSeverity = "info" | "low" | "medium" | "high" | "critical";

export type FindingNote = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  severity: NoteSeverity;
  host?: string;
  path?: string;
  method?: string;
  flowId?: string;
  cvss?: CvssVector;
  cvssVector?: string;
  cvssScore?: number;
  body: string;
  tags: string[];
};

export type NotesStore = {
  version: 1;
  notes: FindingNote[];
};

export function emptyNotes(): NotesStore {
  return { version: 1, notes: [] };
}

export function emptyNote(id: string): FindingNote {
  const cvss = { ...DEFAULT_CVSS, C: "N", I: "N", A: "N" } as CvssVector;
  const scored = scoreCvss(cvss);
  return {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: "New finding",
    severity: "info",
    body: "",
    tags: [],
    cvss,
    cvssVector: scored.vector,
    cvssScore: scored.score,
  };
}

export function exportFindingsMarkdown(notes: FindingNote[], scanner: Finding[]): string {
  const lines: string[] = ["# Lurkwire findings", "", `Exported ${new Date().toISOString()}`, ""];
  if (notes.length) {
    lines.push("## Notes", "");
    for (const note of notes) {
      lines.push(`### ${note.title}`);
      lines.push("");
      lines.push(`- Severity: ${note.severity}`);
      if (note.cvssVector) {
        lines.push(`- CVSS 3.1: ${note.cvssScore ?? "?"} (${note.cvssVector})`);
      }
      if (note.method || note.host) {
        lines.push(`- Target: ${note.method ?? ""} ${note.host ?? ""}${note.path ?? ""}`.trim());
      }
      if (note.flowId) {
        lines.push(`- Evidence: lurkwire://history#${note.flowId}`);
      }
      if (note.tags.length) {
        lines.push(`- Tags: ${note.tags.join(", ")}`);
      }
      lines.push("");
      if (note.body) {
        lines.push(note.body, "");
      }
    }
  }
  if (scanner.length) {
    lines.push("## Scanner findings", "");
    for (const item of scanner) {
      lines.push(`### ${item.title}`);
      lines.push("");
      lines.push(`- Severity: ${item.severity}`);
      lines.push(`- Check: ${item.check_id}`);
      lines.push(`- Target: ${item.method} ${item.host}${item.path}`);
      if (item.status != null) {
        lines.push(`- Status: ${item.status}`);
      }
      if (item.count > 1) {
        lines.push(`- Count: ${item.count}`);
      }
      lines.push("");
      if (item.detail) {
        lines.push(item.detail, "");
      }
      if (item.flow_id) {
        lines.push(`- Evidence: lurkwire://history#${item.flow_id}`);
      }
      if (item.evidence) {
        lines.push("", "```", item.evidence, "```", "");
      }
    }
  }
  if (notes.length === 0 && scanner.length === 0) {
    lines.push("_No findings yet._", "");
  }
  return lines.join("\n");
}

export { formatCvssVector };
