import { FormEvent, useEffect, useRef, useState } from "react";
import type { AppSnapshot, FlowDetail, FlowSummary, LlmAction, LlmResult } from "../../../shared/types";
import { Tooltip } from "./Tooltip";
import { takeLlm } from "../workbench/pendingLlm";
import { localFindingBrief } from "../../../shared/llmFinding";

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: LlmAction;
  provider?: string;
  model?: string;
  draft?: LlmResult["draft"];
};

const ACTIONS: { id: LlmAction; label: string }[] = [
  { id: "explain", label: "Explain request" },
  { id: "summarize", label: "Summarize traffic" },
  { id: "payloads", label: "Generate payloads" },
  { id: "poc", label: "Draft a PoC" },
  { id: "suggest", label: "Suggest tests" },
  { id: "draft", label: "Draft into Repeater" },
];

export function LlmSidebar({
  state,
  onDraft,
}: {
  state: AppSnapshot;
  onDraft: (flow: FlowDetail) => void;
}) {
  const open = state.prefs.llmSidebarOpen;
  const width = state.prefs.llmSidebarWidth ?? 340;
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [flowId, setFlowId] = useState("");
  const [findingId, setFindingId] = useState("");
  const [findingLabel, setFindingLabel] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    void window.lurkwire.hasLlmKey().then(setHasKey);
    void window.lurkwire
      .listFlows({ project_id: state.currentProjectId ?? undefined, limit: 40 })
      .then((list) => setFlows(list.items));
  }, [open, state.currentProjectId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const consume = async () => {
      const pending = takeLlm();
      if (!pending) {
        return;
      }
      if (pending.flowId) {
        setFlowId(pending.flowId);
      }
      if (pending.findingId) {
        setFindingId(pending.findingId);
        setFindingLabel(pending.title ?? pending.findingId);
        try {
          const finding = await window.lurkwire.getFinding(pending.findingId);
          const kind = pending.action === "suggest" ? "suggest" : "explain";
          const brief = localFindingBrief(finding, kind);
          setTurns((current) => [
            ...current,
            { id: crypto.randomUUID(), role: "user", text: pending.title || finding.title, action: pending.action },
            { id: crypto.randomUUID(), role: "assistant", text: brief, action: pending.action, provider: "local", model: "finding-brief" },
          ]);
        } catch {
          // Fall through to the model call.
        }
      }
      const keyReady = await window.lurkwire.hasLlmKey();
      if (keyReady) {
        void run(pending.action, pending.raw, { flowId: pending.flowId, findingId: pending.findingId });
      }
    };
    void consume();
    window.addEventListener("lurkwire:llm-pending", consume);
    return () => window.removeEventListener("lurkwire:llm-pending", consume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const run = async (action: LlmAction, prompt?: string, ids?: { flowId?: string; findingId?: string }) => {
    const raw = (prompt ?? input).trim();
    if (!raw && !flowId && action === "chat") {
      return;
    }
    setBusy(true);
    setError(null);
    if (raw) {
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: raw, action },
      ]);
      setInput("");
    } else {
      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "user", text: ACTIONS.find((item) => item.id === action)?.label ?? action, action },
      ]);
    }
    try {
      const next = await window.lurkwire.llmComplete({
        action,
        flowId: ids?.flowId || flowId || undefined,
        findingId: ids?.findingId || findingId || undefined,
        raw: raw || undefined,
      });
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: next.text,
          action,
          provider: next.provider,
          model: next.model,
          draft: next.draft,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void run("chat", input);
  };

  if (!open) {
    return null;
  }

  const sendDraft = (draft: NonNullable<LlmResult["draft"]>) => {
    onDraft({
      id: "draft",
      project_id: state.currentProjectId ?? "",
      ts: Date.now(),
      method: draft.method,
      scheme: "",
      host: "",
      port: 0,
      path: "",
      query: "",
      url: draft.url,
      http_version: "HTTP/1.1",
      status: null,
      req_len: 0,
      resp_len: 0,
      duration_ms: null,
      source: "ai",
      mime: null,
      in_scope: true,
      truncated: false,
      tags: [],
      note: "",
      req_headers: draft.headers,
      resp_headers: [],
      req_blob: null,
      resp_blob: null,
      req_preview: draft.body ?? "",
      resp_preview: null,
    });
  };

  return (
    <aside className="llm-sidebar" style={{ width }} aria-label="AI assistant">
      {findingLabel ? <div className="llm-finding">Finding: {findingLabel}</div> : null}
      <div
        className="llm-resizer"
        role="separator"
        aria-label="Resize assistant"
        onMouseDown={(event) => {
          event.preventDefault();
          const startX = event.clientX;
          const start = width;
          const onMove = (move: MouseEvent) => {
            const next = Math.min(520, Math.max(280, start - (move.clientX - startX)));
            void window.lurkwire.setPrefs({ llmSidebarWidth: next });
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
      <div className="llm-head">
        <div>
          <strong>Assistant</strong>
          <span className="meta">{hasKey ? "Key saved" : "BYO key or local Ollama"}</span>
        </div>
        <div className="llm-head-actions">
          <Tooltip label="AI settings">
            <button type="button" className="tb" aria-label="AI settings" onClick={() => void window.lurkwire.navigate("lurkwire://settings")}>
              ⚙
            </button>
          </Tooltip>
          <button
            type="button"
            className="tb"
            aria-label="Close assistant"
            onClick={() => void window.lurkwire.setPrefs({ llmSidebarOpen: false })}
          >
            ×
          </button>
        </div>
      </div>
      <label className="llm-context">
        Context flow
        <select value={flowId} onChange={(event) => setFlowId(event.target.value)}>
          <option value="">None</option>
          {flows.map((flow) => (
            <option key={flow.id} value={flow.id}>
              {flow.method} {flow.status ?? "—"} {flow.host}
              {flow.path}
            </option>
          ))}
        </select>
      </label>
      <div className="llm-actions">
        {ACTIONS.map((item) => (
          <button key={item.id} type="button" disabled={busy} onClick={() => void run(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="llm-thread">
        {turns.length === 0 ? (
          <p className="placeholder">
            Chat with your own key or a local OpenAI-compatible server. Attach a captured flow, then explain it,
            generate payloads, summarize traffic, or draft a PoC. Nothing is sent to the target until you press Send
            in Repeater.
          </p>
        ) : null}
        {turns.map((turn) => (
          <div key={turn.id} className={`llm-bubble ${turn.role}`}>
            <div className="llm-bubble-meta">
              {turn.role === "user" ? "You" : turn.provider ? `${turn.provider} / ${turn.model}` : "Assistant"}
            </div>
            <pre>{turn.text}</pre>
            {turn.draft ? (
              <button type="button" className="primary" onClick={() => sendDraft(turn.draft!)}>
                Open draft in Repeater
              </button>
            ) : null}
          </div>
        ))}
        {busy ? <div className="llm-bubble assistant pending">Thinking…</div> : null}
        {error ? <div className="banner">{error}</div> : null}
        <div ref={endRef} />
      </div>
      <form className="llm-composer" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void run("chat", input);
            }
          }}
          placeholder="Ask about this request, or paste a param…"
          rows={3}
          spellCheck={false}
        />
        <button type="submit" className="primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </aside>
  );
}
