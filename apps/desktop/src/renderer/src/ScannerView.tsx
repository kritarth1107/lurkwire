import { useEffect, useMemo, useState } from "react";
import type { Finding, FlowDetail, Severity } from "../../shared/types";
import { formatTime, statusClass } from "../../shared/http";
import { HttpViewer } from "./HttpViewer";
import { EmptyState } from "./EmptyState";
import { takeScannerDraft } from "./workbench/pendingSend";

const SEVERITIES: { id: "" | Severity; label: string }[] = [
  { id: "", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "info", label: "Info" },
];

const ORDER: Severity[] = ["high", "medium", "low", "info"];

export function ScannerView({
  projectId,
  onSendToRepeater,
}: {
  projectId: string | null;
  onSendToRepeater: (flow: FlowDetail) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [severity, setSeverity] = useState<"" | Severity>("");
  const [items, setItems] = useState<Finding[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<FlowDetail | null>(null);
  const [queue, setQueue] = useState<FlowDetail[]>([]);
  const [retesting, setRetesting] = useState(false);

  useEffect(() => {
    const draft = takeScannerDraft();
    if (draft) {
      setQueue((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      void retest(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        const list = await window.lurkwire.listFindings({
          project_id: projectId ?? undefined,
          q: debounced || undefined,
          severity: severity || undefined,
          limit: 250,
        });
        if (cancelled) {
          return;
        }
        setItems(list.items);
        setTotal(list.total);
        setError(null);
        setSelected((current) => {
          if (!current) {
            return current;
          }
          return list.items.find((item: Finding) => item.id === current.id) ?? current;
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [debounced, projectId, severity]);

  useEffect(() => {
    if (!selected?.flow_id) {
      setEvidence(null);
      return;
    }
    void window.lurkwire.getFlow(selected.flow_id).then(setEvidence).catch(() => setEvidence(null));
  }, [selected?.flow_id]);

  async function retest(flow: FlowDetail) {
    setRetesting(true);
    setError(null);
    try {
      await window.lurkwire.activeSend({
        project_id: flow.project_id ?? projectId ?? undefined,
        method: flow.method,
        url: flow.url,
        headers: flow.req_headers,
        body: flow.req_preview ?? undefined,
        source: "scanner",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetesting(false);
    }
  }

  async function openFlow(finding: Finding) {
    if (!finding.flow_id) {
      return;
    }
    const flow = await window.lurkwire.getFlow(finding.flow_id);
    onSendToRepeater(flow);
  }

  const groups = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const item of items) {
      const list = map.get(item.severity) ?? [];
      list.push(item);
      map.set(item.severity, list);
    }
    return ORDER.filter((key) => map.has(key)).map((key) => ({ severity: key, items: map.get(key) ?? [] }));
  }, [items]);

  return (
    <div className="scanner">
      <div className="workbench-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter findings"
          aria-label="Filter findings"
        />
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as "" | Severity)}
          aria-label="Severity"
        >
          {SEVERITIES.map((item) => (
            <option key={item.id || "all"} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="muted">{total} finding{total === 1 ? "" : "s"}</span>
      </div>
      {queue.length ? (
        <p className="muted">
          Queue: {queue.map((item) => `${item.method} ${item.host}${item.path}`).join(" · ")}
          {retesting ? " · retesting…" : ""}
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="scanner-split">
        <div className="scanner-list">
          {items.length ? (
            groups.map((group) => (
              <div key={group.severity} className="finding-group">
                <h4>
                  <span className={`sev sev-${group.severity}`}>{group.severity}</span> {group.items.length}
                </h4>
                <table className="history-table">
                  <tbody>
                    {group.items.map((item) => (
                      <tr
                        key={item.id}
                        className={selected?.id === item.id ? "selected" : undefined}
                        onClick={() => setSelected(item)}
                        onDoubleClick={() => void openFlow(item)}
                      >
                        <td className="path">{item.title}</td>
                        <td className="path">{item.host}</td>
                        <td>{item.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          ) : (
            <EmptyState title="No findings yet">
              Right-click a request and choose Send to Scanner, or browse an in-scope site. Passive checks run on captured responses. Request smuggling has its own tool in the top bar.
            </EmptyState>
          )}
        </div>
        <div className="scanner-detail">
          {selected ? (
            <>
              <h3>{selected.title}</h3>
              <p className="muted">
                <span className={`sev sev-${selected.severity}`}>{selected.severity}</span>
                {" · "}
                {selected.method} {selected.host}
                {selected.path}
                {selected.status != null ? (
                  <>
                    {" · "}
                    <span className={statusClass(selected.status)}>{selected.status}</span>
                  </>
                ) : null}
                {" · "}
                {formatTime(selected.ts)}
                {selected.count > 1 ? ` · seen ${selected.count} times` : ""}
              </p>
              <p>{selected.detail}</p>
              {selected.evidence ? <pre className="mono evidence">{selected.evidence}</pre> : null}
              <div className="intruder-actions">
                <button type="button" className="primary" disabled={!selected.flow_id} onClick={() => void openFlow(selected)}>
                  Send evidence to Repeater
                </button>
                <button
                  type="button"
                  disabled={!evidence || retesting}
                  onClick={() => evidence && void retest(evidence)}
                >
                  {retesting ? "Retesting…" : "Retest"}
                </button>
              </div>
              {evidence ? <HttpViewer flow={evidence} /> : <p className="muted">No evidence request/response is attached to this finding.</p>}
            </>
          ) : (
            <EmptyState title="Select a finding">
              Click a finding to see the evidence request and response. Use Retest to send the same request again through the scanner.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
