import { useEffect, useState } from "react";
import { INTERACTSH_SERVERS, type InteractshState } from "../../shared/interactsh";

export function OobView() {
  const [state, setState] = useState<InteractshState | null>(null);
  const [server, setServer] = useState<string>(INTERACTSH_SERVERS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  async function refresh() {
    const next = await window.lurkwire.getInteractsh();
    setState(next);
    if (!next.registered) {
      setServer(next.server);
    }
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    const timer = window.setInterval(() => {
      void window.lurkwire.getInteractsh().then(setState);
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(action: () => Promise<InteractshState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const item = state?.interactions[selected] ?? state?.interactions[0] ?? null;

  return (
    <div className="workbench oob-workbench">
      <p className="muted">
        Out-of-band collaborator using the interactsh protocol. Register a payload, place it in a
        request or DNS lookup, and watch for callbacks here.
      </p>
      <div className="workbench-toolbar">
        <select
          value={state?.registered ? state.server : server}
          disabled={state?.registered || busy}
          onChange={(event) => setServer(event.target.value)}
        >
          {INTERACTSH_SERVERS.map((host) => (
            <option key={host} value={host}>
              {host}
            </option>
          ))}
        </select>
        {state?.registered ? (
          <button type="button" disabled={busy} onClick={() => void run(() => window.lurkwire.deregisterInteractsh())}>
            Deregister
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void run(() => window.lurkwire.registerInteractsh(server))}
          >
            {busy ? "Registering…" : "Register"}
          </button>
        )}
        <button type="button" disabled={busy || !state?.registered} onClick={() => void run(() => window.lurkwire.pollInteractsh())}>
          Poll now
        </button>
        <button type="button" disabled={!state?.registered} onClick={() => void run(() => window.lurkwire.newInteractshPayload())}>
          New payload
        </button>
      </div>
      {error || state?.error ? <div className="banner">{error || state?.error}</div> : null}
      {state?.payload ? (
        <div className="oob-payload">
          <code>{state.payload}</code>
          <button type="button" onClick={() => void window.lurkwire.copyText(state.payload ?? "")}>
            Copy URL
          </button>
          <button
            type="button"
            onClick={() => void window.lurkwire.copyText(state.payload ? new URL(state.payload).host : "")}
          >
            Copy host
          </button>
        </div>
      ) : (
        <p className="muted">Register to get a unique callback URL and DNS name.</p>
      )}
      <div className="muted oob-meta">
        {state?.registered
          ? `Registered · ${state.interactions.length} interaction${state.interactions.length === 1 ? "" : "s"}${state.lastPoll ? ` · last poll ${new Date(state.lastPoll).toLocaleTimeString()}` : ""}`
          : "Not registered"}
      </div>
      <div className="oob-split">
        <div className="oob-list">
          {(state?.interactions ?? []).map((row, index) => (
            <button
              type="button"
              key={`${row.timestamp}-${index}`}
              className={`logger-line${item === row ? " selected" : ""}`}
              onClick={() => setSelected(index)}
            >
              <span>{row.protocol || "?"}</span>
              <span className="grow">{row.remoteAddress || row.fullId || row.uniqueId}</span>
              <span className="muted">{row.timestamp}</span>
            </button>
          ))}
          {state?.registered && state.interactions.length === 0 ? (
            <p className="muted empty-pane">Waiting for callbacks…</p>
          ) : null}
        </div>
        {item ? (
          <pre className="code-block oob-detail">
            {`Protocol: ${item.protocol}
From: ${item.remoteAddress}
Id: ${item.fullId || item.uniqueId}
Time: ${item.timestamp}
${item.qType ? `Qtype: ${item.qType}
` : ""}${item.smtpFrom ? `SMTP from: ${item.smtpFrom}
` : ""}
${item.rawRequest || "(no raw request)"}
${item.rawResponse ? `
---
${item.rawResponse}` : ""}`}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
