import { useEffect, useMemo, useState } from "react";
import type { FlowDetail, FlowSummary, HeaderPair } from "../../shared/types";
import {
  DEFAULT_SESSIONS,
  applySessionHeaders,
  compareAuthz,
  type AuthzReplay,
  type AuthzSession,
} from "../../shared/autorize";

function headersFromFlow(flow: FlowDetail): HeaderPair[] {
  return flow.req_headers.filter((item) => {
    const name = item.name.toLowerCase();
    return name !== "host" && name !== "content-length" && name !== "connection";
  });
}

export function AutorizeView({ projectId }: { projectId: string | null }) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [flowId, setFlowId] = useState("");
  const [cookie, setCookie] = useState("");
  const [auth, setAuth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AuthzReplay[]>([]);

  useEffect(() => {
    void window.lurkwire.listFlows({ project_id: projectId ?? undefined, limit: 80 }).then((list) => {
      setFlows(list.items);
      if (!flowId && list.items[0]) {
        setFlowId(list.items[0].id);
      }
    });
  }, [projectId]);

  const sessions: AuthzSession[] = useMemo(
    () => [
      DEFAULT_SESSIONS[0],
      DEFAULT_SESSIONS[1],
      { ...DEFAULT_SESSIONS[2], cookie, headers: auth ? [{ name: "Authorization", value: auth }] : [] },
    ],
    [cookie, auth],
  );

  const baseline = results.find((item) => item.sessionId === "original");
  const verdicts = baseline ? results.filter((item) => item.sessionId !== "original").map((item) => compareAuthz(baseline, item)) : [];

  async function run() {
    if (!flowId) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const detail = await window.lurkwire.getFlow(flowId);
      const body = detail.req_preview ?? "";
      const next: AuthzReplay[] = [];
      for (const session of sessions) {
        try {
          const flow = await window.lurkwire.activeSend({
            project_id: projectId ?? undefined,
            method: detail.method,
            url: detail.url,
            headers: applySessionHeaders(headersFromFlow(detail), session),
            body,
            source: "autorize",
          });
          const text = flow.resp_preview ?? "";
          next.push({
            sessionId: session.id,
            sessionName: session.name,
            status: flow.status,
            length: flow.resp_len,
            body: text,
            flowId: flow.id,
          });
        } catch (err) {
          next.push({
            sessionId: session.id,
            sessionName: session.name,
            status: null,
            length: 0,
            body: "",
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      setResults(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workbench">
      <p className="hint">
        Replay a captured request as the original user, with no session, and as another user. Same 200 responses across
        sessions often mean broken access control. Sends go through the proxy with the usual scope, rate limit, and kill switch.
      </p>
      <div className="repeater-url">
        <select value={flowId} onChange={(event) => setFlowId(event.target.value)} aria-label="Baseline request">
          <option value="">Choose a request…</option>
          {flows.map((item) => (
            <option key={item.id} value={item.id}>
              {item.method} {item.host}{item.path} ({item.status ?? "…"})
            </option>
          ))}
        </select>
        <button type="button" className="primary" disabled={busy || !flowId} onClick={() => void run()}>
          {busy ? "Replaying…" : "Replay sessions"}
        </button>
      </div>
      <label className="intruder-label">
        Other user Cookie
        <input value={cookie} onChange={(event) => setCookie(event.target.value)} placeholder="session=…" spellCheck={false} />
      </label>
      <label className="intruder-label">
        Other user Authorization
        <input value={auth} onChange={(event) => setAuth(event.target.value)} placeholder="Bearer …" spellCheck={false} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {results.length ? (
        <table className="authz-table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Status</th>
              <th>Length</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {results.map((item) => {
              const verdict = verdicts.find((entry) => entry.sessionId === item.sessionId);
              return (
                <tr key={item.sessionId} className={verdict?.kind === "same" || verdict?.kind === "similar" ? "flag" : undefined}>
                  <td>{item.sessionName}</td>
                  <td>{item.status ?? "err"}</td>
                  <td>{item.length}</td>
                  <td>{item.sessionId === "original" ? "Baseline" : verdict?.summary ?? item.error ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
