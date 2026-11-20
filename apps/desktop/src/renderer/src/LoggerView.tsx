import { useEffect, useRef, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { formatTime, statusClass } from "../../shared/http";
import { highlightOf } from "../../shared/flowMeta";
import { AnnotationBar, FlowContextMenu, useFlowContextMenu, type FlowSendHandlers } from "./FlowActions";
import { HttpViewer } from "./HttpViewer";

export function LoggerView({ projectId, handlers }: { projectId: string | null; handlers: FlowSendHandlers }) {
  const [items, setItems] = useState<FlowSummary[]>([]);
  const [source, setSource] = useState("");
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
        const next = source ? list.items.filter((item: FlowSummary) => item.source === source) : list.items;
        setItems(next);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, source]);

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
        <label className="check">
          <input type="checkbox" checked={stick} onChange={(event) => setStick(event.target.checked)} />
          Follow
        </label>
        <span className="muted">{items.length} events</span>
      </div>
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
          const hl = highlightOf(item.tags);
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
