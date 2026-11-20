import { useEffect, useMemo, useState } from "react";
import type { Finding } from "../../shared/types";
import { scoreCvss, type CvssVector, DEFAULT_CVSS } from "../../shared/cvss";
import { emptyNote, type FindingNote, type NoteSeverity, type NotesStore } from "../../shared/notes";

const SEVERITIES: NoteSeverity[] = ["info", "low", "medium", "high", "critical"];

export function NotesView({ projectId }: { projectId: string | null }) {
  const [store, setStore] = useState<NotesStore>({ version: 1, notes: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scanner, setScanner] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [exportText, setExportText] = useState("");

  const note = store.notes.find((item) => item.id === activeId) ?? null;
  const scored = useMemo(() => (note?.cvss ? scoreCvss(note.cvss) : scoreCvss(DEFAULT_CVSS)), [note?.cvss]);

  useEffect(() => {
    void window.lurkwire.notesGet().then((data) => {
      setStore(data);
      setActiveId(data.notes[0]?.id ?? null);
    });
    void window.lurkwire.listFindings({ project_id: projectId ?? undefined, limit: 200 }).then((list) => setScanner(list.items));
  }, [projectId]);

  const persist = (next: NotesStore) => {
    setStore(next);
    void window.lurkwire.notesSave(next).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  const patch = (update: Partial<FindingNote>) => {
    if (!note) {
      return;
    }
    const cvss = update.cvss ?? note.cvss;
    const scoredUpdate = cvss ? scoreCvss(cvss) : undefined;
    persist({
      ...store,
      notes: store.notes.map((item) =>
        item.id === note.id
          ? {
              ...item,
              ...update,
              cvss,
              cvssVector: scoredUpdate?.vector ?? item.cvssVector,
              cvssScore: scoredUpdate?.score ?? item.cvssScore,
              updatedAt: Date.now(),
            }
          : item,
      ),
    });
  };

  const setMetric = (key: keyof CvssVector, value: string) => {
    if (!note) {
      return;
    }
    patch({ cvss: { ...(note.cvss ?? DEFAULT_CVSS), [key]: value } as CvssVector });
  };

  return (
    <div className="workbench notes-workbench">
      <div className="workbench-toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const created = emptyNote(crypto.randomUUID());
            persist({ ...store, notes: [created, ...store.notes] });
            setActiveId(created.id);
          }}
        >
          New note
        </button>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.notesExport(projectId ?? undefined).then((text) => {
              setExportText(text);
              void window.lurkwire.copyText(text);
            });
          }}
        >
          Export markdown
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="notes-split">
        <ul className="notes-list">
          {store.notes.map((item) => (
            <li key={item.id}>
              <button type="button" className={item.id === activeId ? "active" : ""} onClick={() => setActiveId(item.id)}>
                <strong>{item.title}</strong>
                <span className="muted">
                  {item.severity}
                  {item.cvssScore != null ? ` · ${item.cvssScore}` : ""}
                </span>
              </button>
            </li>
          ))}
          <li className="muted">Scanner ({scanner.length})</li>
          {scanner.slice(0, 20).map((item) => (
            <li key={item.id} className="muted">
              {item.severity} · {item.title}
            </li>
          ))}
        </ul>
        {note ? (
          <div className="notes-editor">
            <input value={note.title} onChange={(event) => patch({ title: event.target.value })} placeholder="Title" />
            <div className="notes-row">
              <select value={note.severity} onChange={(event) => patch({ severity: event.target.value as NoteSeverity })}>
                {SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <input value={note.method ?? ""} onChange={(event) => patch({ method: event.target.value })} placeholder="GET" />
              <input value={`${note.host ?? ""}${note.path ?? ""}`} onChange={(event) => {
                const text = event.target.value;
                const slash = text.indexOf("/");
                patch(slash === -1 ? { host: text, path: "" } : { host: text.slice(0, slash), path: text.slice(slash) });
              }} placeholder="host/path" />
            </div>
            <div className="cvss-grid">
              {([
                ["AV", ["N", "A", "L", "P"], "Attack vector"],
                ["AC", ["L", "H"], "Attack complexity"],
                ["PR", ["N", "L", "H"], "Privileges"],
                ["UI", ["N", "R"], "User interaction"],
                ["S", ["U", "C"], "Scope"],
                ["C", ["N", "L", "H"], "Confidentiality"],
                ["I", ["N", "L", "H"], "Integrity"],
                ["A", ["N", "L", "H"], "Availability"],
              ] as const).map(([key, values, label]) => (
                <label key={key}>
                  {label}
                  <select value={(note.cvss ?? DEFAULT_CVSS)[key]} onChange={(event) => setMetric(key, event.target.value)}>
                    {values.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <p className="cvss-score">
              <strong>{scored.score.toFixed(1)}</strong> {scored.severity}
              <span className="muted"> {scored.vector}</span>
            </p>
            <textarea className="mono" rows={10} value={note.body} onChange={(event) => patch({ body: event.target.value })} placeholder="Notes, reproduction, impact…" spellCheck={false} />
            <button
              type="button"
              onClick={() => {
                persist({ ...store, notes: store.notes.filter((item) => item.id !== note.id) });
                setActiveId(store.notes.find((item) => item.id !== note.id)?.id ?? null);
              }}
            >
              Delete
            </button>
          </div>
        ) : (
          <p className="muted">Create a note or export scanner findings.</p>
        )}
      </div>
      {exportText ? <pre className="mono notes-export">{exportText}</pre> : null}
    </div>
  );
}
