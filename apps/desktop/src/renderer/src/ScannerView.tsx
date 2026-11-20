import { useEffect, useState } from "react";
import type { Finding, FlowDetail, Severity } from "../../shared/types";
import { formatTime, statusClass } from "../../shared/http";

const SEVERITIES: { id: "" | Severity; label: string }[] = [
  { id: "", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
  { id: "info", label: "Info" },
];

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
  const [lab, setLab] = useState<string | null>(null);
  const [labBusy, setLabBusy] = useState(false);

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

  async function openFlow(finding: Finding) {
    if (!finding.flow_id) {
      return;
    }
    const flow = await window.lurkwire.getFlow(finding.flow_id);
    onSendToRepeater(flow);
  }

  return (
    <div className="scanner">
      <p className="hint">
        Passive checks run on captured responses only. The optional lab spins a local listener on 127.0.0.1
        and sends a harmless CL.TE probe to that listener — never to a remote host.
      </p>
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
        <button
          type="button"
          disabled={labBusy}
          onClick={() => {
            setLabBusy(true);
            setLab(null);
            void window.lurkwire
              .smugglingLabRun()
              .then((result) => {
                setLab(`127.0.0.1:${result.port} — ${result.detail}${result.smuggled ? " Probe confirmed." : ""}`);
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setLabBusy(false));
          }}
        >
          {labBusy ? "Running lab…" : "Local smuggling lab"}
        </button>
      </div>
      {lab ? <p className="muted">{lab}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <div className="scanner-split">
        <div className="scanner-list">
          <table className="history-table">
            <thead>
              <tr>
                <th>Sev</th>
                <th>Issue</th>
                <th>Host</th>
                <th>#</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={selected?.id === item.id ? "selected" : undefined}
                    onClick={() => setSelected(item)}
                    onDoubleClick={() => void openFlow(item)}
                  >
                    <td>
                      <span className={`sev sev-${item.severity}`}>{item.severity}</span>
                    </td>
                    <td className="path">{item.title}</td>
                    <td className="path">{item.host}</td>
                    <td>{item.count}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="empty" colSpan={4}>
                    Browse a site to collect passive findings.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                <button
                  type="button"
                  className="primary"
                  disabled={!selected.flow_id}
                  onClick={() => void openFlow(selected)}
                >
                  Send latest flow to Repeater
                </button>
              </div>
            </>
          ) : (
            <p className="muted">Select a finding to inspect it.</p>
          )}
        </div>
      </div>
    </div>
  );
}
