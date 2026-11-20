import { useEffect, useState } from "react";
import type { FlowDetail, FlowSummary } from "../../shared/types";
import { HIGHLIGHT_COLORS, highlightOf, setHighlight, type HighlightColor } from "../../shared/flowMeta";
import { addComparerItem } from "./workbench";

export type FlowSendHandlers = {
  onSendToRepeater: (flow: FlowDetail) => void;
  onSendToIntruder: (flow: FlowDetail) => void;
  onSendToComparer?: (flow: FlowDetail) => void;
};

export async function sendFlow(id: string, target: "repeater" | "intruder" | "comparer", handlers: FlowSendHandlers) {
  const flow = await window.lurkwire.getFlow(id);
  if (target === "repeater") {
    handlers.onSendToRepeater(flow);
    return;
  }
  if (target === "intruder") {
    handlers.onSendToIntruder(flow);
    return;
  }
  addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
  handlers.onSendToComparer?.(flow);
}

type MenuState = { x: number; y: number; flow: FlowSummary } | null;

export function useFlowContextMenu() {
  const [menu, setMenu] = useState<MenuState>(null);
  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);
  return { menu, setMenu };
}

export function FlowContextMenu({
  menu,
  handlers,
  onPatched,
}: {
  menu: MenuState;
  handlers: FlowSendHandlers;
  onPatched?: (flow: FlowDetail) => void;
}) {
  if (!menu) {
    return null;
  }
  const highlight = highlightOf(menu.flow.tags);

  async function annotate(color: HighlightColor | null) {
    const flow = await window.lurkwire.patchFlow(menu!.flow.id, {
      tags: setHighlight(menu!.flow.tags, color),
    });
    onPatched?.(flow);
  }

  async function comment() {
    const next = window.prompt("Comment on this request", menu!.flow.note || "");
    if (next === null) {
      return;
    }
    const flow = await window.lurkwire.patchFlow(menu!.flow.id, { note: next });
    onPatched?.(flow);
  }

  return (
    <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} role="menu">
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "repeater", handlers)}>
        Send to Repeater
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "intruder", handlers)}>
        Send to Intruder
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "comparer", handlers)}>
        Send to Comparer
      </button>
      <div className="ctx-sep" />
      <div className="ctx-label">Highlight</div>
      <div className="hl-row">
        <button type="button" className={`hl-swatch none${highlight === null ? " on" : ""}`} onClick={() => void annotate(null)} title="None" />
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`hl-swatch hl-${color}${highlight === color ? " on" : ""}`}
            title={color}
            onClick={() => void annotate(color)}
          />
        ))}
      </div>
      <button type="button" onClick={() => void comment()}>
        Comment…
      </button>
      <button type="button" onClick={() => void window.lurkwire.copyText(menu.flow.url)}>
        Copy URL
      </button>
    </div>
  );
}

export function AnnotationBar({
  flow,
  onPatched,
}: {
  flow: FlowSummary | FlowDetail | null;
  onPatched?: (flow: FlowDetail) => void;
}) {
  if (!flow) {
    return null;
  }
  const highlight = highlightOf(flow.tags);
  return (
    <div className="annotation-bar">
      <span className="ctx-label">Highlight</span>
      <div className="hl-row">
        <button
          type="button"
          className={`hl-swatch none${highlight === null ? " on" : ""}`}
          title="None"
          onClick={() => void window.lurkwire.patchFlow(flow.id, { tags: setHighlight(flow.tags, null) }).then((next) => onPatched?.(next))}
        />
        {HIGHLIGHT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`hl-swatch hl-${color}${highlight === color ? " on" : ""}`}
            title={color}
            onClick={() => void window.lurkwire.patchFlow(flow.id, { tags: setHighlight(flow.tags, color) }).then((next) => onPatched?.(next))}
          />
        ))}
      </div>
      <label className="note-field">
        Comment
        <input
          defaultValue={flow.note}
          key={`${flow.id}:${flow.note}`}
          onBlur={(event) => {
            if (event.target.value === flow.note) {
              return;
            }
            void window.lurkwire.patchFlow(flow.id, { note: event.target.value }).then((next) => onPatched?.(next));
          }}
        />
      </label>
    </div>
  );
}
