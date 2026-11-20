import { useEffect, useRef, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { formatTime, statusClass } from "../../shared/http";
import { HIGHLIGHT_COLORS } from "../../shared/flowMeta";
import { EMPTY_FILTER, flowMatchesFilter, highlightForFlow, type HighlightRule, type LoggerFilter } from "../../shared/loggerFilters";
import { AnnotationBar, FlowContextMenu, useFlowContextMenu, type FlowSendHandlers } from "./FlowActions";
import { HttpViewer } from "./HttpViewer";

export function LoggerView({ projectId, handlers }: { projectId: string | null; handlers: FlowSendHandlers }) {
  const [items, setItems] = useState<FlowSummary[]>([]);
  const [source, setSource] = useState("");
  const [filter, setFilter] = useState<LoggerFilter>(EMPTY_FILTER);
  const [rules, setRules] = useState<HighlightRule[]>(() => {
    try {
      const raw = localStorage.getItem("lurkwire.logger.rules");
      return raw ? (JSON.parse(raw) as HighlightRule[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [stick, setStick] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const { menu, setMenu } = useFlowContextMenu();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await window.lurkwire.listFlows({
        project_id: projectId ?? undefined,
        hide_static: false,
        limit: 400,
      });
      if (!cancelled) {
        let next = list.items as FlowSummary[];
        if (source) {
          next = next.filter((item) => item.source === source);
        }
        next = next.filter((item) => flowMatchesFilter(item, { ...filter, source: "" }));
        setItems(next);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, source, filter]);

  useEffect(() => {
    if (stick && scroller.current) {
      scroller.current.scrollTop = scroller.current.scrollHeight;
    }
  }, [items, stick]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void window.lurkwire.getFlow(selectedId).then(setDetail);
  }, [selectedId]);

  const sources = [...new Set(items.map((item) => item.source).filter(Boolean))];

  const persistRules = (next: HighlightRule[]) => {
    setRules(next);
    localStorage.setItem("lurkwire.logger.rules", JSON.stringify(next));
  };

  return (
    <div className="workbench logger-workbench">
      <div className="workbench-toolbar">
        <select value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">All sources</option>
          {sources.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <input
          value={filter.query}
          onChange={(event) => setFilter((current) => ({ ...current, query: event.target.value }))}
          placeholder="Filter or /regex/"
          aria-label="Logger filter"
        />
        <select value={filter.method} onChange={(event) => setFilter((current) => ({ ...current, method: event.target.value }))} aria-label="Method">
          <option value="">All methods</option>
          {["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((method) => (
            <option key={method} value={method}>{method}</option>
          ))}
        </select>
        <select value={filter.status} onChange={(event) => setFilter((current) => ({ ...current, status: event.target.value }))} aria-label="Status">
          <option value="">All status</option>
          {["2xx", "3xx", "4xx", "5xx", "200", "301", "302", "401", "403", "404", "500"].map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        <label className="check">
          <input type="checkbox" checked={filter.interestingOnly} onChange={(event) => setFilter((current) => ({ ...current, interestingOnly: event.target.checked }))} />
          Interesting
        </label>
        <label className="check">
          <input type="checkbox" checked={stick} onChange={(event) => setStick(event.target.checked)} />
          Follow
        </label>
        <span className="muted">{items.length} events</span>
        <button
          type="button"
          onClick={() =>
            persistRules([
              ...rules,
              { id: crypto.randomUUID(), pattern: filter.query || "admin|token|error", color: "red", enabled: true },
            ])
          }
        >
          Highlight
        </button>
      </div>
      {rules.length ? (
        <div className="logger-rules">
          {rules.map((rule) => (
            <label key={rule.id} className={`check hl-${rule.color}`}>
              <input type="checkbox" checked={rule.enabled} onChange={(event) => persistRules(rules.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item))} />
              /{rule.pattern}/
              <select value={rule.color} onChange={(event) => persistRules(rules.map((item) => item.id === rule.id ? { ...item, color: event.target.value as HighlightRule["color"] } : item))}>
                {HIGHLIGHT_COLORS.map((color) => (
                  <option key={color} value={color}>{color}</option>
                ))}
              </select>
              <button type="button" onClick={() => persistRules(rules.filter((item) => item.id !== rule.id))}>×</button>
            </label>
          ))}
        </div>
      ) : null}
      <div
        className="logger-stream"
        ref={scroller}
        onScroll={(event) => {
          const el = event.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
          setStick(atBottom);
        }}
      >
        {items.map((item) => {
          const hl = highlightForFlow(item, rules);
          return (
            <button
              type="button"
              key={item.id}
              className={`logger-line${selectedId === item.id ? " selected" : ""}${hl ? ` hl-${hl}` : ""}`}
              onClick={() => setSelectedId(item.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedId(item.id);
                setMenu({ x: event.clientX, y: event.clientY, flow: item });
              }}
            >
              <span className="muted">{formatTime(item.ts)}</span>
              <span className="src">{item.source}</span>
              <span>{item.method}</span>
              <span className={statusClass(item.status)}>{item.status ?? "…"}</span>
              <span className="grow">{item.host}{item.path}</span>
            </button>
          );
        })}
      </div>
      <AnnotationBar flow={detail} onPatched={setDetail} />
      <HttpViewer flow={detail} />
      <FlowContextMenu menu={menu} handlers={handlers} />
    </div>
  );
}
