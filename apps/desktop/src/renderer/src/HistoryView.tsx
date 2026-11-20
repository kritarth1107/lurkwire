import { useEffect, useMemo, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { formatBytes, formatTime, shortMime, statusClass } from "../../shared/http";
import { flowTitle, highlightOf, tlsLabel } from "../../shared/flowMeta";
import { AnnotationBar, addFlowHostToScope, copyClickjackPoc, copyCsrfPoc, copyFlowCurl, copySecurityHeaderReport, retestCors, FlowContextMenu, sendFlow, useFlowContextMenu, type FlowSendHandlers } from "./FlowActions";
import { flowsToHar, harToString, type HarBody, type HarFlowInput } from "../../shared/harExport";
import { downloadText } from "./downloadText";
import { HttpViewer } from "./HttpViewer";

type ColId = "#" | "host" | "method" | "url" | "status" | "length" | "mime" | "title" | "tls" | "time";

const COLS: { id: ColId; label: string; width: number }[] = [
  { id: "#", label: "#", width: 48 },
  { id: "host", label: "Host", width: 150 },
  { id: "method", label: "Method", width: 70 },
  { id: "url", label: "URL", width: 240 },
  { id: "status", label: "Status", width: 64 },
  { id: "length", label: "Length", width: 80 },
  { id: "mime", label: "MIME", width: 110 },
  { id: "title", label: "Title", width: 120 },
  { id: "tls", label: "TLS", width: 90 },
  { id: "time", label: "Time", width: 80 },
];

type Sort = { id: ColId; dir: "asc" | "desc" };

type Props = {
  projectId: string | null;
  handlers: FlowSendHandlers;
};

function cell(item: FlowSummary, index: number, id: ColId): string {
  switch (id) {
    case "#":
      return String(index + 1);
    case "host":
      return item.host;
    case "method":
      return item.method;
    case "url":
      return `${item.path}${item.query ? `?${item.query}` : ""}`;
    case "status":
      return item.status === null ? "" : String(item.status);
    case "length":
      return formatBytes(item.resp_len || item.req_len);
    case "mime":
      return shortMime(item.mime);
    case "title":
      return flowTitle(item.path, item.host);
    case "tls":
      return tlsLabel(item.scheme, item.http_version);
    case "time":
      return formatTime(item.ts);
    default:
      return "";
  }
}

function sortValue(item: FlowSummary, index: number, id: ColId): string | number {
  if (id === "#") {
    return index;
  }
  if (id === "status") {
    return item.status ?? -1;
  }
  if (id === "length") {
    return item.resp_len || item.req_len;
  }
  if (id === "time") {
    return item.ts;
  }
  return cell(item, index, id).toLowerCase();
}

export function HistoryView({ projectId, handlers }: Props) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hideStatic, setHideStatic] = useState(true);
  const [items, setItems] = useState<FlowSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>({ id: "time", dir: "desc" });
  const [widths, setWidths] = useState<Record<ColId, number>>(() =>
    Object.fromEntries(COLS.map((col) => [col.id, col.width])) as Record<ColId, number>,
  );
  const [tableHeight, setTableHeight] = useState(240);
  const { menu, setMenu } = useFlowContextMenu();
  const [exporting, setExporting] = useState(false);

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
          limit: 500,
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

  const rows = useMemo(() => {
    const indexed = items.map((item, index) => ({ item, index }));
    indexed.sort((a, b) => {
      const av = sortValue(a.item, a.index, sort.id);
      const bv = sortValue(b.item, b.index, sort.id);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return indexed;
  }, [items, sort]);

  function toggleSort(id: ColId) {
    setSort((prev) => (prev.id === id ? { id, dir: prev.dir === "asc" ? "desc" : "asc" } : { id, dir: "asc" }));
  }

  function startResize(id: ColId, startX: number) {
    const start = widths[id];
    const onMove = (event: MouseEvent) => {
      const next = Math.min(480, Math.max(id === "#" ? 36 : 56, start + event.clientX - startX));
      setWidths((prev) => ({ ...prev, [id]: next }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function startSplit(startY: number) {
    const start = tableHeight;
    const onMove = (event: MouseEvent) => {
      setTableHeight(Math.min(520, Math.max(120, start + event.clientY - startY)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }


  async function bodyOf(flow: FlowDetail, which: "req" | "resp"): Promise<HarBody | undefined> {
    const blob = which === "req" ? flow.req_blob : flow.resp_blob;
    const preview = which === "req" ? flow.req_preview : flow.resp_preview;
    if (blob && window.lurkwire) {
      try {
        const raw = await window.lurkwire.getFlowBody(flow.id, which);
        if (raw) {
          return { base64: raw };
        }
      } catch {
        /* fall through to preview */
      }
    }
    return preview ? { text: preview } : undefined;
  }

  async function exportHar() {
    if (!window.lurkwire || exporting || items.length === 0) {
      return;
    }
    setExporting(true);
    try {
      const chosen = items.slice(0, 250);
      const details: HarFlowInput[] = [];
      for (const item of chosen) {
        const flow = await window.lurkwire.getFlow(item.id);
        details.push({
          ...flow,
          requestBody: await bodyOf(flow, "req"),
          responseBody: await bodyOf(flow, "resp"),
        });
      }
      downloadText("lurkwire-history.har", harToString(flowsToHar(details)), "application/json");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  function applyPatch(flow: FlowDetail) {
    setDetail(flow);
    setItems((prev) => prev.map((item) => (item.id === flow.id ? { ...item, tags: flow.tags, note: flow.note } : item)));
  }

  return (
    <div className="workbench history-workbench">
      <div className="workbench-toolbar">
        <input
          type="search"
          placeholder="Filter host, path, method…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="check">
          <input type="checkbox" checked={hideStatic} onChange={(event) => setHideStatic(event.target.checked)} />
          Hide static
        </label>
        <span className="muted">
          {items.length}
          {total > items.length ? ` of ${total}` : ""} flows
        </span>
        <button type="button" disabled={exporting || items.length === 0} onClick={() => void exportHar()} title="Export the visible history (up to 250 flows) as a HAR 1.2 file">
          {exporting ? "Exporting HAR…" : "Export HAR"}
        </button>
        {detail ? (
          <>
            <button type="button" onClick={() => void handlers.onSendToRepeater(detail)}>
              Send to Repeater
            </button>
            <button type="button" onClick={() => void handlers.onSendToIntruder(detail)}>
              Send to Intruder
            </button>
            <button type="button" onClick={() => void sendToComparer(detail, handlers)}>
              Send to Comparer
            </button>
            <button type="button" onClick={() => void sendFlow(detail.id, "workbench", handlers)}>
              Send to Workbench
            </button>
            <button type="button" onClick={() => void copyCsrfPoc(detail.id)}>
              CSRF PoC
            </button>
            <button type="button" onClick={() => void copyClickjackPoc(detail.id)}>
              Clickjacking PoC
            </button>
            <button type="button" onClick={() => void copySecurityHeaderReport(detail.id)}>
              Header report
            </button>
            <button type="button" onClick={() => void copyFlowCurl(detail.id)}>
              Copy cURL
            </button>
            <button type="button" onClick={() => void addFlowHostToScope(detail.id)}>
              Add host to scope
            </button>
            <button
              type="button"
              onClick={() => {
                void retestCors(detail.id)
                  .then((summary) => setError(summary))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
              }}
            >
              Retest CORS
            </button>
          </>
        ) : null}
      </div>
      {error ? <div className="banner">{error}</div> : null}
      <div className="history-table-wrap" style={{ height: tableHeight }}>
        <table className="history-table resizable">
          <thead>
            <tr>
              {COLS.map((col) => (
                <th key={col.id} style={{ width: widths[col.id] }} onClick={() => toggleSort(col.id)}>
                  <span>
                    {col.label}
                    {sort.id === col.id ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                  </span>
                  <i
                    className="col-resizer"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      startResize(col.id, event.clientX);
                    }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="muted">
                  No flows yet. Browse a site and they will land here.
                </td>
              </tr>
            ) : (
              rows.map(({ item, index }) => {
                const hl = highlightOf(item.tags);
                return (
                  <tr
                    key={item.id}
                    className={`${selectedId === item.id ? "selected" : ""}${hl ? ` hl-${hl}` : ""}`}
                    onClick={() => setSelectedId(item.id)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedId(item.id);
                      setMenu({ x: event.clientX, y: event.clientY, flow: item });
                    }}
                    title={item.note || undefined}
                  >
                    {COLS.map((col) => (
                      <td key={col.id} style={{ width: widths[col.id] }} className={col.id === "status" ? statusClass(item.status) : undefined}>
                        {cell(item, index, col.id)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div
        className="split-resizer horizontal"
        onMouseDown={(event) => {
          event.preventDefault();
          startSplit(event.clientY);
        }}
      />
      <AnnotationBar flow={detail} onPatched={applyPatch} />
      <HttpViewer flow={detail} />
      <FlowContextMenu menu={menu} handlers={handlers} onPatched={applyPatch} />
    </div>
  );
}

async function sendToComparer(flow: FlowDetail, handlers: FlowSendHandlers) {
  const { addComparerItem } = await import("./workbench");
  addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
  handlers.onSendToComparer?.(flow);
}
