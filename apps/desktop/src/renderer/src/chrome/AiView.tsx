import { useEffect, useState } from "react";
import type { FlowDetail, FlowSummary, LlmAction, LlmResult } from "../../../shared/types";

export function AiView({
  projectId,
  onDraft,
}: {
  projectId: string | null;
  onDraft: (flow: FlowDetail) => void;
}) {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [flowId, setFlowId] = useState<string>("");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState<LlmAction | null>(null);
  const [result, setResult] = useState<LlmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);

  useEffect(() => {
    void window.lurkwire.hasLlmKey().then(setHasKey);
    void window.lurkwire.listAiMemory().then((items) => setMemoryCount(items.length));
    void window.lurkwire
      .listFlows({ project_id: projectId ?? undefined, limit: 30 })
      .then((list) => {
        setFlows(list.items);
        setFlowId((current) => current || list.items[0]?.id || "");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId]);

  const run = async (action: LlmAction) => {
    setBusy(action);
    setError(null);
    try {
      const next = await window.lurkwire.llmComplete({
        action,
        flowId: flowId || undefined,
        raw: raw || undefined,
      });
      setResult(next);
      void window.lurkwire.listAiMemory().then((items) => setMemoryCount(items.length));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const sendDraft = async () => {
    if (!result?.draft) {
      return;
    }
    const draft = result.draft;
    onDraft({
      id: "draft",
      project_id: projectId ?? "",
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
    <div className="workbench">
      <div className="workbench-toolbar">
        <span className="meta">AI drafts, you send</span>
        {hasKey ? <span className="meta">Key saved</span> : <span className="meta">No API key (Ollama can run without one)</span>}
        <span className="meta">{memoryCount} memorized turn{memoryCount === 1 ? "" : "s"}</span>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.clearAiMemory().then(() => setMemoryCount(0));
          }}
        >
          Clear memory
        </button>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 0, flex: 1 }}>
        {error ? <div className="banner">{error}</div> : null}
        <label className="check">
          Context flow
          <select
            value={flowId}
            onChange={(event) => setFlowId(event.target.value)}
            style={{ marginLeft: 8, flex: 1 }}
          >
            <option value="">None</option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                {flow.method} {flow.status ?? "—"} {flow.host}
                {flow.path}
              </option>
            ))}
          </select>
        </label>
        <textarea
          className="raw-editor"
          style={{ flex: "0 0 28%" }}
          placeholder="Or paste a request to analyze"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          spellCheck={false}
        />
        <div className="workbench-toolbar" style={{ border: 0, padding: 0 }}>
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void run("explain")}>
            {busy === "explain" ? "Explaining…" : "Explain"}
          </button>
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void run("suggest")}>
            {busy === "suggest" ? "Suggesting…" : "Suggest"}
          </button>
          <button type="button" className="primary" disabled={Boolean(busy)} onClick={() => void run("draft")}>
            {busy === "draft" ? "Drafting…" : "Draft into Repeater"}
          </button>
        </div>
        {result ? (
          <>
            <div className="meta">
              {result.provider} / {result.model}
              {result.redacted ? " · secrets redacted before the cloud call" : ""}
            </div>
            <textarea className="raw-editor" readOnly value={result.text} spellCheck={false} />
            {result.draft ? (
              <button type="button" className="primary" onClick={() => void sendDraft()}>
                Open draft in Repeater
              </button>
            ) : null}
          </>
        ) : (
          <p className="placeholder">
            Explain a captured flow, get test ideas, or draft a request. Nothing is sent to the target until you
            press Send in Repeater.
          </p>
        )}
      </div>
    </div>
  );
}
