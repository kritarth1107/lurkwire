import { useEffect, useMemo, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { formatBytes, formatTime, shortMime, statusClass } from "../../shared/http";

type Props = {
  projectId: string | null;
  onSendToRepeater: (flow: FlowDetail) => void;
};

export function HistoryView({ projectId, onSendToRepeater }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hideStatic, setHideStatic] = useState(true);
  const [items, setItems] = useState<FlowSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<"req" | "resp">("resp");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!window.lurkwire) {
        return;
      }
      try {
        const list = await window.lurkwire.listFlows({
          project_id: projectId ?? undefined,
          q: debounced || undefined,
          hide_static: hideStatic,
          limit: 250,
        });
        if (cancelled) {
          return;
        }
        setItems(list.items);
        setTotal(list.total);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [debounced, hideStatic, projectId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void window.lurkwire.getFlow(selectedId).then((flow) => {
      if (!cancelled) {
        setDetail(flow);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <main className="workbench">
      <div className="workbench-toolbar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder='Filter: host:example.com method:POST status:>=400 password'
          spellCheck={false}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={hideStatic}
            onChange={(event) => setHideStatic(event.target.checked)}
          />
          Hide static
        </label>
        <span className="meta">
          {items.length}
          {total > items.length ? ` of ${total}` : ""} flows
        </span>
      </div>
      {error ? <div className="banner">{error}</div> : null}
      <div className="history-split">
        <div className="table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status</th>
                <th>Method</th>
                <th>Host</th>
                <th>Path</th>
                <th>Type</th>
                <th>Size</th>
                <th>Ms</th>
              </tr>
            </thead>
            <tbody>
              {items.map((flow) => (
                <tr
                  key={flow.id}
                  className={flow.id === selectedId ? "selected" : undefined}
                  onClick={() => setSelectedId(flow.id)}
                >
                  <td className="mono">{formatTime(flow.ts)}</td>
                  <td className={statusClass(flow.status)}>
                    {flow.status ?? "—"}
                  </td>
                  <td className="method">{flow.method}</td>
                  <td title={flow.host}>{flow.host}</td>
                  <td className="path" title={flow.url}>
                    {flow.path}
                    {flow.query ? `?${flow.query}` : ""}
                  </td>
                  <td className="muted">{shortMime(flow.mime)}</td>
                  <td className="mono">{formatBytes(flow.resp_len)}</td>
                  <td className="mono">{flow.duration_ms ?? ""}</td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty">
                    No flows yet. Browse a site in the Browser tab and they will land here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <aside className="detail">
          {detail && selected ? (
            <>
              <div className="detail-head">
                <div>
                  <div className="detail-title">
                    <span className="method">{detail.method}</span> {detail.url}
                  </div>
                  <div className="muted">
                    {detail.status ?? "pending"} · {detail.source} ·{" "}
                    {formatBytes(detail.req_len)} / {formatBytes(detail.resp_len)}
                  </div>
                </div>
                <button
                  type="button"
                  className="primary"
                  onClick={() => onSendToRepeater(detail)}
                >
                  Send to Repeater
                </button>
              </div>
              <div className="detail-tabs">
                <button
                  type="button"
                  className={pane === "req" ? "active" : ""}
                  onClick={() => setPane("req")}
                >
                  Request
                </button>
                <button
                  type="button"
                  className={pane === "resp" ? "active" : ""}
                  onClick={() => setPane("resp")}
                >
                  Response
                </button>
              </div>
              <pre className="headers">
                {pane === "req"
                  ? formatHeaderBlock(detail.req_headers)
                  : formatHeaderBlock(detail.resp_headers)}
              </pre>
              <pre className="body">
                {pane === "req"
                  ? detail.req_preview || (detail.req_blob ? "(binary body)" : "(empty)")
                  : detail.resp_preview || (detail.resp_blob ? "(binary body)" : "(empty)")}
              </pre>
            </>
          ) : (
            <div className="empty-pane">Select a request to inspect it.</div>
          )}
        </aside>
      </div>
    </main>
  );
}

function formatHeaderBlock(headers: { name: string; value: string }[]): string {
  return headers.map((header) => `${header.name}: ${header.value}`).join("\n") || "(no headers)";
}
