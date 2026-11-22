import { useEffect, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { HIDDEN_PARAM_WORDLIST, alreadyPresent, appendParam, isInterestingParam, type ParamObservation } from "../../shared/paramMiner";
import { takeParamMinerDraft } from "./workbench/pendingSend";
import { EmptyState } from "./EmptyState";
import { statusClass } from "../../shared/http";

export function ParamMinerView({ projectId }: { projectId: string | null }) {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [headers, setHeaders] = useState<{ name: string; value: string }[]>([]);
  const [names, setNames] = useState(HIDDEN_PARAM_WORDLIST.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<ParamObservation[]>([]);
  const [baseline, setBaseline] = useState<{ status: number | null; length: number } | null>(null);

  useEffect(() => {
    const draft = takeParamMinerDraft();
    if (draft) {
      applyDraft(draft);
    }
  }, []);

  function applyDraft(flow: FlowDetail) {
    setUrl(flow.url);
    setMethod(flow.method);
    setHeaders(flow.req_headers);
  }

  async function run() {
    if (!url) {
      setError("Send a request here or paste a URL first.");
      return;
    }
    setBusy(true);
    setError(null);
    setHits([]);
    try {
      const base = await window.lurkwire.activeSend({
        project_id: projectId ?? undefined,
        method,
        url,
        headers,
        source: "paramminer",
      });
      const baseObs = { status: base.status, length: Number(base.resp_len ?? 0) };
      setBaseline(baseObs);
      const list = names.split(/\r?\n/).map((item) => item.trim()).filter((item) => item && !alreadyPresent(url, item));
      const next: ParamObservation[] = [];
      for (const name of list) {
        try {
          const sent = await window.lurkwire.activeSend({
            project_id: projectId ?? undefined,
            method,
            url: appendParam(url, name),
            headers,
            source: "paramminer",
          });
          const obs: ParamObservation = {
            name,
            url: appendParam(url, name),
            status: sent.status,
            length: Number(sent.resp_len ?? 0),
            delta: Math.abs(Number(sent.resp_len ?? 0) - baseObs.length),
            interesting: isInterestingParam(baseObs, { status: sent.status, length: Number(sent.resp_len ?? 0) }),
            flowId: sent.id,
          };
          next.push(obs);
          setHits([...next]);
        } catch (err) {
          next.push({
            name,
            url: appendParam(url, name),
            status: null,
            length: 0,
            delta: 0,
            interesting: true,
            error: err instanceof Error ? err.message : String(err),
          });
          setHits([...next]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const interesting = hits.filter((item) => item.interesting);

  return (
    <div className="tool-split">
      <div className="tool-list">
        {!url && !busy ? (
          <EmptyState title="No request loaded">
            Right-click a request in Traffic and send it here from the command palette (“Param miner”), or paste a URL. The host must be in scope. Hidden names are compared against a baseline by status and length.
          </EmptyState>
        ) : null}
        <div className="repeater-url">
          <input className="method" value={method} onChange={(event) => setMethod(event.target.value)} aria-label="Method" />
          <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://target/path" spellCheck={false} />
          <button type="button" className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? "Mining…" : "Mine"}
          </button>
        </div>
        <label className="intruder-label">
          Parameter names
          <textarea className="mono" rows={6} value={names} onChange={(event) => setNames(event.target.value)} spellCheck={false} />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <p className="muted">
          {baseline ? `Baseline ${baseline.status ?? "—"} / ${baseline.length} bytes. ` : ""}
          {interesting.length} interesting of {hits.length} probes.
        </p>
        <table className="history-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Length</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {(interesting.length ? interesting : hits).map((row) => (
              <tr key={row.name} className={row.interesting ? "anomaly" : undefined}>
                <td className="path">{row.name}</td>
                <td className={statusClass(row.status)}>{row.error ?? row.status ?? "—"}</td>
                <td>{row.length}</td>
                <td>{row.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tool-detail">
        <h3>Hidden parameters</h3>
        <p>Each name is appended to the query string and compared to a baseline request. Status changes or length deltas of 8+ bytes are flagged.</p>
      </div>
    </div>
  );
}
