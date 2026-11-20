import { useEffect, useState } from "react";
import type { ForwardEdit, InterceptConfig, InterceptState, PausedItem } from "../../shared/types";
import { formatHeaders, parseHeaderBlock } from "../../shared/http";

const defaultConfig: InterceptConfig = {
  enabled: false,
  requests: true,
  responses: false,
  timeout_ms: 30_000,
};

export function InterceptView() {
  const [state, setState] = useState<InterceptState>({
    config: defaultConfig,
    queue: [],
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("200");
  const [headers, setHeaders] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.lurkwire) {
        return;
      }
      try {
        const next = await window.lurkwire.getIntercept();
        if (cancelled) {
          return;
        }
        setState(next);
        setError(null);
        setSelectedId((current) => {
          if (current && next.queue.some((item: PausedItem) => item.id === current)) {
            return current;
          }
          return next.queue[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 400);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const selected = state.queue.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      return;
    }
    setMethod(selected.method);
    setUrl(selected.url);
    setStatus(String(selected.status ?? 200));
    setHeaders(formatHeaders(selected.headers));
    setBody(selected.body ?? "");
  }, [selected?.id]);

  const saveConfig = async (patch: Partial<InterceptConfig>) => {
    const config = { ...state.config, ...patch };
    const next = await window.lurkwire.setIntercept(config);
    setState(next);
  };

  const decide = async (kind: "forward" | "drop") => {
    if (!selected) {
      return;
    }
    setBusy(true);
    try {
      if (kind === "drop") {
        await window.lurkwire.dropIntercept(selected.id);
      } else {
        const edit: ForwardEdit = {
          method,
          url,
          headers: parseHeaderBlock(headers),
          body,
          body_base64: selected.body_base64,
        };
        if (selected.direction === "response") {
          const code = Number(status);
          if (Number.isFinite(code)) {
            edit.status = code;
          }
        }
        await window.lurkwire.forwardIntercept(selected.id, edit);
      }
      const next = await window.lurkwire.getIntercept();
      setState(next);
      setSelectedId(next.queue[0]?.id ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workbench">
      <div className="workbench-toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={state.config.enabled}
            onChange={(event) => void saveConfig({ enabled: event.target.checked })}
          />
          Intercept is {state.config.enabled ? "on" : "off"}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={state.config.requests}
            onChange={(event) => void saveConfig({ requests: event.target.checked })}
          />
          Requests
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={state.config.responses}
            onChange={(event) => void saveConfig({ responses: event.target.checked })}
          />
          Responses
        </label>
        <label className="check">
          Timeout
          <input
            className="timeout"
            type="number"
            min={1}
            value={Math.round(state.config.timeout_ms / 1000)}
            onChange={(event) =>
              void saveConfig({ timeout_ms: Number(event.target.value) * 1000 })
            }
          />
          s
        </label>
        <span className="meta">{state.queue.length} paused</span>
      </div>
      {error ? <div className="banner">{error}</div> : null}
      <div className="history-split intercept-split">
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Dir</th>
                <th>Method</th>
                <th>URL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {state.queue.map((item) => (
                <tr
                  key={item.id}
                  className={item.id === selectedId ? "selected" : undefined}
                  onClick={() => setSelectedId(item.id)}
                >
                  <td>{item.direction}</td>
                  <td className="method">{item.method}</td>
                  <td className="path" title={item.url}>
                    {item.url}
                  </td>
                  <td>{item.status ?? "—"}</td>
                </tr>
              ))}
              {state.queue.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    {state.config.enabled
                      ? "Waiting for a request to pause. Browse a site to fill the queue."
                      : "Turn intercept on, then browse. Paused requests appear here to edit, forward, or drop."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <section className="repeater-editor">
          {selected ? (
            <>
              <div className="repeater-url">
                <input
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  style={{ maxWidth: 90 }}
                  spellCheck={false}
                />
                {selected.direction === "response" ? (
                  <input
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    style={{ maxWidth: 80 }}
                    spellCheck={false}
                  />
                ) : null}
                <input
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void decide("forward")}
                >
                  Forward
                </button>
                <button type="button" disabled={busy} onClick={() => void decide("drop")}>
                  Drop
                </button>
              </div>
              <textarea
                className="raw-editor intercept-headers"
                value={headers}
                onChange={(event) => setHeaders(event.target.value)}
                spellCheck={false}
              />
              <textarea
                className="raw-editor"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                spellCheck={false}
              />
            </>
          ) : (
            <div className="empty-pane">Select a paused item to edit it.</div>
          )}
        </section>
      </div>
    </main>
  );
}

