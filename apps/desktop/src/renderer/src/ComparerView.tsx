import { useEffect, useMemo, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { lineDiff } from "../../shared/diff";
import { formatHeaders, headerMime, prettyBody } from "../../shared/httpFormat";
import { addComparerItem, clearComparer, removeComparerItem, useComparerItems } from "./workbench";
import type { FlowSendHandlers } from "./FlowActions";

type Side = "req" | "resp";
type View = "pretty" | "raw" | "headers";

function textOf(flow: FlowDetail, side: Side, view: View): string {
  const headers = side === "req" ? flow.req_headers : flow.resp_headers;
  if (view === "headers") {
    return formatHeaders(headers);
  }
  const raw = (side === "req" ? flow.req_preview : flow.resp_preview) ?? "";
  const mime = side === "resp" ? flow.mime : headerMime(flow.req_headers);
  return view === "pretty" ? prettyBody(raw, mime) : raw;
}

export function ComparerView({ handlers }: { handlers: FlowSendHandlers }) {
  const items = useComparerItems();
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [left, setLeft] = useState<FlowDetail | null>(null);
  const [right, setRight] = useState<FlowDetail | null>(null);
  const [side, setSide] = useState<Side>("resp");
  const [view, setView] = useState<View>("pretty");
  const [manual, setManual] = useState("");

  useEffect(() => {
    if (!leftId && items[0]) {
      setLeftId(items[0].id);
    }
    if (!rightId && items[1]) {
      setRightId(items[1].id);
    }
  }, [items, leftId, rightId]);

  useEffect(() => {
    if (!leftId) {
      setLeft(null);
      return;
    }
    void window.lurkwire.getFlow(leftId).then(setLeft).catch(() => setLeft(null));
  }, [leftId]);

  useEffect(() => {
    if (!rightId) {
      setRight(null);
      return;
    }
    void window.lurkwire.getFlow(rightId).then(setRight).catch(() => setRight(null));
  }, [rightId]);

  const diff = useMemo(() => {
    if (!left || !right) {
      return [];
    }
    return lineDiff(textOf(left, side, view), textOf(right, side, view));
  }, [left, right, side, view]);

  return (
    <div className="workbench comparer-workbench">
      <div className="workbench-toolbar">
        <select value={leftId ?? ""} onChange={(event) => setLeftId(event.target.value || null)}>
          <option value="">A…</option>
          {items.map((item) => (
            <option key={`a-${item.id}`} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={rightId ?? ""} onChange={(event) => setRightId(event.target.value || null)}>
          <option value="">B…</option>
          {items.map((item) => (
            <option key={`b-${item.id}`} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="seg">
          <button type="button" className={side === "req" ? "active" : ""} onClick={() => setSide("req")}>
            Request
          </button>
          <button type="button" className={side === "resp" ? "active" : ""} onClick={() => setSide("resp")}>
            Response
          </button>
        </div>
        <div className="seg">
          {(["pretty", "raw", "headers"] as View[]).map((item) => (
            <button key={item} type="button" className={view === item ? "active" : ""} onClick={() => setView(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => clearComparer()}>
          Clear
        </button>
      </div>
      <div className="comparer-add">
        <input
          placeholder="Paste a flow id to add"
          value={manual}
          onChange={(event) => setManual(event.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            const id = manual.trim();
            if (!id) {
              return;
            }
            void window.lurkwire.getFlow(id).then((flow) => {
              addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
              setManual("");
            });
          }}
        >
          Add
        </button>
      </div>
      <ul className="comparer-list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.label}</span>
            <button type="button" onClick={() => removeComparerItem(item.id)}>
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 ? <li className="muted">Right-click a request and choose Send to Comparer, or send two flows from Traffic.</li> : null}
      </ul>
      {left && right ? (
        <div className="diff-view">
          {diff.map((line, index) => (
            <div key={index} className={`diff-line ${line.kind}`}>
              <span className="diff-mark">{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}</span>
              <pre>{line.text || " "}</pre>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted empty-pane">Pick two requests to compare.</p>
      )}
      {left ? (
        <div className="workbench-toolbar">
          <button type="button" onClick={() => handlers.onSendToRepeater(left)}>
            Send A to Repeater
          </button>
          <button type="button" onClick={() => handlers.onSendToIntruder(left)}>
            Send A to Intruder
          </button>
        </div>
      ) : null}
    </div>
  );
}
