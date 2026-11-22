import { useEffect, useState } from "react";
import type { FlowDetail, FlowSummary, HeaderPair } from "../../shared/types";
import { HIGHLIGHT_COLORS, highlightOf, setHighlight, type HighlightColor } from "../../shared/flowMeta";
import { addComparerItem } from "./workbench";
import { buildCsrfPoc } from "../../shared/csrf";
import { buildClickjackPoc } from "../../shared/clickjack";
import { base64ToBytes, fromBytes } from "../../shared/codec";
import { flowToCurl, flowToFetch } from "../../shared/http";
import { analyzeCors, corsProbeHeaders } from "../../shared/corsProbe";
import { extractJwts } from "../../shared/jwt";
import { queueJwt } from "./pendingJwt";
import { analyzeSecurityHeaders, formatSecurityReport } from "../../shared/securityHeaders";

export type FlowSendHandlers = {
  onSendToRepeater: (flow: FlowDetail) => void;
  onSendToIntruder: (flow: FlowDetail) => void;
  onSendToScanner?: (flow: FlowDetail) => void;
  onSendToComparer?: (flow: FlowDetail) => void;
};

export async function sendFlow(id: string, target: "repeater" | "intruder" | "scanner" | "comparer" | "workbench", handlers: FlowSendHandlers) {
  const flow = await window.lurkwire.getFlow(id);
  if (target === "repeater") {
    handlers.onSendToRepeater(flow);
    return;
  }
  if (target === "intruder") {
    handlers.onSendToIntruder(flow);
    return;
  }
  if (target === "scanner") {
    handlers.onSendToScanner?.(flow);
    if (!handlers.onSendToScanner) {
      await window.lurkwire.setTool("scanner");
    }
    return;
  }
  if (target === "workbench") {
    const imported = await window.lurkwire.workbenchImportFlow(id);
    await window.lurkwire.navigate(`lurkwire://workbench#${imported.request.id}`);
    return;
  }
  addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
  handlers.onSendToComparer?.(flow);
}

export async function copyCsrfPoc(id: string): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  let body = flow.req_preview ?? "";
  try {
    const raw = await window.lurkwire.getFlowBody(id, "req");
    if (raw) {
      body = fromBytes(base64ToBytes(raw));
    }
  } catch {
    /* preview is enough */
  }
  const poc = buildCsrfPoc({
    method: flow.method,
    url: flow.url,
    headers: flow.req_headers,
    body,
  });
  await window.lurkwire.copyText(poc.html);
}



export async function copyFlowCurl(id: string): Promise<void> {
  await copyFlowAs(id, flowToCurl);
}

export async function copyFlowFetch(id: string): Promise<void> {
  await copyFlowAs(id, flowToFetch);
}

async function copyFlowAs(
  id: string,
  render: (flow: FlowDetail, body?: string) => string,
): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  let body = flow.req_preview ?? "";
  try {
    const raw = await window.lurkwire.getFlowBody(id, "req");
    if (raw) {
      body = fromBytes(base64ToBytes(raw));
    }
  } catch {
    /* preview is enough */
  }
  await window.lurkwire.copyText(render(flow, body || undefined));
}



export async function sendJwtToDecoder(id: string): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  const chunks = [
    flow.url,
    ...flow.req_headers.map((header: HeaderPair) => `${header.name}: ${header.value}`),
    ...flow.resp_headers.map((header: HeaderPair) => `${header.name}: ${header.value}`),
    flow.req_preview ?? "",
    flow.resp_preview ?? "",
  ];
  try {
    const raw = await window.lurkwire.getFlowBody(id, "req");
    if (raw) {
      chunks.push(fromBytes(base64ToBytes(raw)));
    }
  } catch {
    /* preview is enough */
  }
  try {
    const raw = await window.lurkwire.getFlowBody(id, "resp");
    if (raw) {
      chunks.push(fromBytes(base64ToBytes(raw)));
    }
  } catch {
    /* preview is enough */
  }
  const tokens = extractJwts(chunks.join("\n"));
  const token = tokens[0];
  if (!token) {
    throw new Error("No JWT was found in this request or response.");
  }
  queueJwt(token);
  await window.lurkwire.setTool("decode");
}

export async function retestCors(id: string): Promise<string> {
  const flow = await window.lurkwire.getFlow(id);
  if (!flow.in_scope) {
    throw new Error("CORS retest only runs against in-scope hosts.");
  }
  const sent = await window.lurkwire.activeSend({
    project_id: flow.project_id,
    method: "OPTIONS",
    url: flow.url,
    headers: corsProbeHeaders(flow.method),
    source: "scanner",
  });
  return analyzeCors(sent.resp_headers).summary;
}

export async function addFlowHostToScope(id: string): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  await window.lurkwire.addScope({
    project_id: flow.project_id,
    kind: "include",
    host: flow.host,
    port: flow.port || undefined,
  });
}

export async function copyClickjackPoc(id: string): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  const poc = buildClickjackPoc({ url: flow.url });
  await window.lurkwire.copyText(poc.html);
}

export async function copySecurityHeaderReport(id: string): Promise<void> {
  const flow = await window.lurkwire.getFlow(id);
  const report = analyzeSecurityHeaders(flow.resp_headers, flow.url);
  await window.lurkwire.copyText(formatSecurityReport(report, flow.url));
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
        Send to Repeater <kbd>Ctrl+R</kbd>
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "intruder", handlers)}>
        Send to Intruder <kbd>Ctrl+I</kbd>
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "scanner", handlers)}>
        Send to Scanner
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "comparer", handlers)}>
        Send to Comparer
      </button>
      <button type="button" onClick={() => void sendFlow(menu.flow.id, "workbench", handlers)}>
        Send to Workbench
      </button>
      <button type="button" onClick={() => void copyCsrfPoc(menu.flow.id)}>
        Copy CSRF PoC
      </button>
      <button type="button" onClick={() => void copyClickjackPoc(menu.flow.id)}>
        Copy clickjacking PoC
      </button>
      <button type="button" onClick={() => void copySecurityHeaderReport(menu.flow.id)}>
        Copy security header report
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
      <button type="button" onClick={() => void copyFlowCurl(menu.flow.id)}>
        Copy as curl
      </button>
      <button type="button" onClick={() => void copyFlowFetch(menu.flow.id)}>
        Copy as fetch
      </button>
      <button type="button" onClick={() => void addFlowHostToScope(menu.flow.id)}>
        Add to scope
      </button>
      <button type="button" onClick={() => void retestCors(menu.flow.id).then((summary) => window.alert(summary))}>
        Retest CORS
      </button>
      <button type="button" onClick={() => void sendJwtToDecoder(menu.flow.id)}>
        Send JWT to Decoder
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
