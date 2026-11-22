import { useState } from "react";
import { EmptyState } from "./EmptyState";

export function SmugglingView({ projectId }: { projectId: string | null }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lab, setLab] = useState<string | null>(null);
  const [probe, setProbe] = useState<{ detail: string; raw?: string; smuggled?: boolean } | null>(null);
  void projectId;

  return (
    <div className="tool-split">
      <div className="tool-list">
        <EmptyState title="Request smuggling">
          Start with the local CL.TE lab — it only talks to 127.0.0.1. To probe a real host, add it to scope first, then run the in-scope probe. This sends a harmless CL+TE request and reports what came back; it is a hint, not a confirmed finding.
        </EmptyState>
        <div className="workbench-toolbar">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.lurkwire
                .smugglingLabRun()
                .then((result) => {
                  setLab(`127.0.0.1:${result.port} — ${result.detail}${result.smuggled ? " Probe confirmed." : ""}`);
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? "Running…" : "Run local CL.TE lab"}
          </button>
        </div>
        {lab ? <p>{lab}</p> : null}
        <div className="repeater-url">
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://in-scope-host/" spellCheck={false} />
          <button
            type="button"
            disabled={busy || !url}
            onClick={() => {
              setBusy(true);
              setError(null);
              void window.lurkwire
                .smugglingProbe(url)
                .then((result) => setProbe({ detail: result.detail, raw: result.raw, smuggled: result.smuggled }))
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
          >
            Probe in-scope host
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="tool-detail">
        {probe ? (
          <>
            <h3>{probe.smuggled ? "Interesting response" : "Probe result"}</h3>
            <p>{probe.detail}</p>
            {probe.raw ? <pre className="mono evidence">{probe.raw.slice(0, 8000)}</pre> : null}
          </>
        ) : (
          <p className="muted">Lab and probe output lands here.</p>
        )}
      </div>
    </div>
  );
}
