import { useEffect, useState } from "react";
import { reportFromStores } from "../../shared/reportExport";
import { emptyNotes, type NotesStore } from "../../shared/notes";
import type { Finding } from "../../shared/types";
import { EmptyState } from "./EmptyState";

export function ReportView({ projectId }: { projectId: string | null }) {
  const [markdown, setMarkdown] = useState("");
  const [html, setHtml] = useState("");
  const [count, setCount] = useState({ findings: 0, notes: 0 });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"md" | "html">("md");

  async function refresh() {
    const [findings, notes] = await Promise.all([
      window.lurkwire.listFindings({ project_id: projectId ?? undefined, limit: 500 }),
      window.lurkwire.notesGet() as Promise<NotesStore>,
    ]);
    const built = reportFromStores({
      product: "Lurkwire",
      findings: findings.items as Finding[],
      notes: notes ?? emptyNotes(),
    });
    setMarkdown(built.markdown);
    setHtml(built.html);
    setCount({ findings: findings.items.length, notes: (notes ?? emptyNotes()).notes.length });
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId]);

  async function save(kind: "md" | "html") {
    const path = await window.lurkwire.saveTextFile(
      kind === "md" ? "lurkwire-report.md" : "lurkwire-report.html",
      kind === "md" ? markdown : html,
      kind === "md"
        ? [{ name: "Markdown", extensions: ["md"] }]
        : [{ name: "HTML", extensions: ["html"] }],
    );
    if (path) {
      void window.lurkwire.revealPath?.(path);
    }
  }

  return (
    <div className="tool-split">
      <div className="tool-list">
        <div className="workbench-toolbar">
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" className="primary" onClick={() => void save("md")}>
            Save Markdown
          </button>
          <button type="button" onClick={() => void save("html")}>
            Save HTML
          </button>
          <button type="button" onClick={() => void window.lurkwire.copyText(tab === "md" ? markdown : html)}>
            Copy
          </button>
          <span className="muted">
            {count.findings} findings · {count.notes} notes
          </span>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {!count.findings && !count.notes ? (
          <EmptyState title="Nothing to export yet">
            Run the Scanner against in-scope traffic and add Notes. This report pulls both. You can also right-click a request and Send to Scanner first.
          </EmptyState>
        ) : null}
      </div>
      <div className="tool-detail">
        <div className="seg">
          <button type="button" className={tab === "md" ? "active" : ""} onClick={() => setTab("md")}>
            Markdown
          </button>
          <button type="button" className={tab === "html" ? "active" : ""} onClick={() => setTab("html")}>
            HTML
          </button>
        </div>
        {tab === "md" ? <pre className="mono evidence">{markdown}</pre> : <iframe className="report-frame" title="Report preview" srcDoc={html} />}
      </div>
    </div>
  );
}
