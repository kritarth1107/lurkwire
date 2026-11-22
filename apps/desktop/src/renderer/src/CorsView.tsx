import { useMemo, useState } from "react";
import { CORS_PROBE_ORIGIN, analyzeCors, type CorsAnalysis } from "../../shared/corsProbe";
import { EmptyState } from "./EmptyState";
import type { FlowDetail } from "../../shared/types";

type ProbeKind = "preflight" | "request";

type ProbeResult = {
  kind: ProbeKind;
  flow: FlowDetail;
  analysis: CorsAnalysis;
};

export function CorsView({ projectId }: { projectId: string | null }) {
  const [url, setUrl] = useState("https://httpbin.org/get");
  const [origin, setOrigin] = useState(CORS_PROBE_ORIGIN);
  const [method, setMethod] = useState("GET");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ProbeResult[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const current = selected != null ? results[selected] : results[0];
  const verdict = useMemo(() => current?.analysis, [current]);

  async function probe(kind: ProbeKind) {
    const target = url.trim();
    if (!target) {
      setError("Enter a URL to probe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const flow = await window.lurkwire.activeSend({
        project_id: projectId ?? undefined,
        method: kind === "preflight" ? "OPTIONS" : method,
        url: target,
        headers: kind === "preflight"
            ? [
                { name: "Origin", value: origin },
                { name: "Access-Control-Request-Method", value: method || "GET" },
                { name: "Access-Control-Request-Headers", value: "content-type, authorization" },
              ]
            : [{ name: "Origin", value: origin }],
        source: "cors",
      });
      const analysis = analyzeCors(flow.resp_headers, origin);
      const next: ProbeResult = { kind, flow, analysis };
      setResults((prev) => [next, ...prev].slice(0, 24));
      setSelected(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tool-split cors-view">
      <div className="tool-list">
        <div className="workbench-toolbar wrap">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://target.example/api"
            aria-label="CORS target URL"
            spellCheck={false}
          />
          <input
            value={origin}
            onChange={(event) => setOrigin(event.target.value)}
            placeholder="Origin"
            aria-label="Probe Origin"
            spellCheck={false}
            style={{ maxWidth: 220 }}
          />
          <select value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Request method">
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" className="primary" disabled={busy} onClick={() => void probe("preflight")}>
            {busy ? "Probing…" : "Send preflight"}
          </button>
          <button type="button" disabled={busy} onClick={() => void probe("request")}>
            Send request
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {busy && !results.length ? <div className="skeleton-block" aria-hidden="true" /> : null}
        {results.length ? (
          <table className="history-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Status</th>
                <th>Allow-Origin</th>
                <th>Creds</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr
                  key={`${item.flow.id}-${index}`}
                  className={index === (selected ?? 0) ? "selected" : ""}
                  onClick={() => setSelected(index)}
                >
                  <td>{item.kind}</td>
                  <td className="num">{item.flow.status ?? "—"}</td>
                  <td className="path">{item.analysis.allowOrigin ?? "—"}</td>
                  <td>{item.analysis.allowCredentials ? "yes" : "no"}</td>
                  <td>{item.analysis.reflectsOrigin ? "reflects origin" : item.analysis.wildcard ? "wildcard" : item.analysis.allowOrigin ? "explicit" : "blocked"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No CORS probes yet">
            Send a preflight OPTIONS request with a custom Origin, or a simple request, then triage Access-Control headers.
            Add the host to Scope if the proxy default-denies the request.
          </EmptyState>
        )}
      </div>
      <div className="tool-detail">
        {verdict && current ? (
          <div className="cors-detail">
            <div className="workbench-toolbar">
              <strong>{current.kind === "preflight" ? "Preflight" : "Request"}</strong>
              <span className="muted">{current.flow.status ?? "no status"}</span>
            </div>
            <p className={`cors-verdict${verdict.credentialedWildcard || verdict.reflectsOrigin ? " warn" : ""}`}>
              {verdict.summary}
            </p>
            <dl className="kv">
              <div>
                <dt>Access-Control-Allow-Origin</dt>
                <dd>{verdict.allowOrigin ?? "—"}</dd>
              </div>
              <div>
                <dt>Credentials</dt>
                <dd>{verdict.allowCredentials ? "true" : "false"}</dd>
              </div>
              <div>
                <dt>Methods</dt>
                <dd>{verdict.allowMethods ?? "—"}</dd>
              </div>
              <div>
                <dt>Headers</dt>
                <dd>{verdict.allowHeaders ?? "—"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <EmptyState title="Select a probe">Results and a verdict appear here after a request is sent.</EmptyState>
        )}
      </div>
    </div>
  );
}
