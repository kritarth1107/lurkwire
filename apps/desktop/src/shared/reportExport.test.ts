import { describe, expect, it } from "vitest";
import { reportFromStores } from "./reportExport";
import { emptyNotes, emptyNote } from "./notes";
import type { Finding } from "./types";

const finding: Finding = {
  id: "f1",
  project_id: "p",
  flow_id: "fl",
  ts: 1,
  check_id: "missing-csp",
  title: "Missing Content-Security-Policy",
  severity: "medium",
  detail: "HTML responses should send a CSP.",
  evidence: "content-type: text/html",
  host: "juice.local",
  path: "/",
  method: "GET",
  status: 200,
  count: 3,
};

describe("findings report export", () => {
  it("builds Markdown and HTML from scanner findings and notes", () => {
    const notes = emptyNotes();
    const note = emptyNote("n1");
    note.title = "Stored XSS in search";
    note.severity = "high";
    note.body = "The q parameter reflects unsanitized.";
    notes.notes.push(note);
    const { markdown, html } = reportFromStores({
      product: "Lurkwire",
      projectName: "Juice Shop",
      findings: [finding],
      notes,
      generatedAt: Date.UTC(2026, 0, 2),
    });
    expect(markdown).toContain("# Lurkwire findings report");
    expect(markdown).toContain("Missing Content-Security-Policy");
    expect(markdown).toContain("Stored XSS in search");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Missing Content-Security-Policy");
    expect(html).toContain("Stored XSS in search");
  });
});
