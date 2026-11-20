import { useEffect, useMemo, useState } from "react";
import type { ProtoDocument, WbRequest } from "../../../shared/workbench";
import { stubJson } from "../../../shared/workbench/protoParse";
import type { StreamFrame, StreamSessionRecord } from "../../../shared/workbench/streamHistory";

export function GrpcPane({ request, onChange }: { request: WbRequest; onChange: (patch: Partial<WbRequest>) => void }) {
  const proto = request.grpc?.proto ?? "";
  const service = request.grpc?.service ?? "";
  const method = request.grpc?.method ?? "";
  const [doc, setDoc] = useState<ProtoDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frames, setFrames] = useState<StreamFrame[]>([]);
  const [history, setHistory] = useState<StreamSessionRecord[]>([]);
  const [payload, setPayload] = useState(request.body.json || request.body.raw || "{\n}\n");

  useEffect(() => {
    return window.lurkwire.onWorkbenchStream((frame) => {
      setFrames((current) => [...current, frame]);
    });
  }, []);

  useEffect(() => {
    void window.lurkwire.workbenchStreamHistory().then((data) => setHistory(data.sessions.filter((item) => item.kind === "grpc")));
  }, [sessionId]);

  useEffect(() => {
    if (!proto.trim()) {
      setDoc(null);
      return;
    }
    void window.lurkwire.workbenchGrpcDescribe(proto).then(setDoc).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [proto]);

  const services = doc?.services ?? [];
  const methods = services.find((item) => item.name === service || item.fullName === service)?.methods ?? [];
  const rpc = methods.find((item) => item.name === method);
  const mode = rpc
    ? rpc.clientStreaming && rpc.serverStreaming
      ? "bidirectional"
      : rpc.clientStreaming
        ? "client-streaming"
        : rpc.serverStreaming
          ? "server-streaming"
          : "unary"
    : "";

  const patchGrpc = (patch: NonNullable<WbRequest["grpc"]>) => {
    onChange({ grpc: { service, method, proto, metadata: request.grpc?.metadata ?? [], ...request.grpc, ...patch } });
  };

  async function invoke() {
    setBusy(true);
    setError(null);
    setFrames([]);
    try {
      const state = await window.lurkwire.getState();
      const result = await window.lurkwire.workbenchGrpcInvoke({
        target: request.url,
        proto,
        service,
        method,
        body: payload,
        metadata: (request.grpc?.metadata ?? request.headers)
          .filter((item) => item.enabled !== false && item.key)
          .map((item) => ({ name: item.key, value: item.value })),
        projectId: state.currentProjectId,
        requestId: request.id,
      });
      setSessionId(result.sessionId);
      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const visibleFrames = useMemo(
    () => frames.filter((item) => !sessionId || item.sessionId === sessionId),
    [frames, sessionId],
  );

  return (
    <div className="wb-grpc">
      <p className="wb-muted">
        Unary, server-streaming, client-streaming, and bidirectional calls run from the desktop process after the same scope
        and kill-switch checks as other active tools. For client-streaming or bidirectional methods, send a JSON array of
        messages. Frames are saved to Workbench stream history.
      </p>
      <div className="wb-stream-actions">
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.workbenchPickProto().then((file) => {
              if (file) {
                patchGrpc({ proto: file.text });
              }
            });
          }}
        >
          Upload .proto
        </button>
        <button
          type="button"
          disabled={!request.url || busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void window.lurkwire
              .workbenchGrpcReflect(request.url)
              .then((text) => patchGrpc({ proto: text }))
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false));
          }}
        >
          Use reflection
        </button>
        <button type="button" className="primary" disabled={busy || !proto || !service || !method} onClick={() => void invoke()}>
          {busy ? "Calling…" : mode && mode !== "unary" ? "Stream" : "Invoke"}
        </button>
        {mode ? <span className="wb-muted">{mode}</span> : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <label className="intruder-label">
        Proto
        <textarea className="mono" rows={8} value={proto} onChange={(event) => patchGrpc({ proto: event.target.value })} spellCheck={false} />
      </label>
      <div className="notes-row">
        <label>
          Service
          <select value={service} onChange={(event) => patchGrpc({ service: event.target.value, method: "" })}>
            <option value="">Select…</option>
            {services.map((item) => (
              <option key={item.fullName} value={item.fullName}>
                {item.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select
            value={method}
            onChange={(event) => {
              const next = event.target.value;
              const found = methods.find((item) => item.name === next);
              patchGrpc({ method: next });
              if (found && doc) {
                const stub = stubJson(doc, found.requestType);
                const payloadText = found.clientStreaming ? `[${stub}]` : stub;
                setPayload(payloadText);
                onChange({ body: { ...request.body, mode: "json", json: payloadText } });
              }
            }}
          >
            <option value="">Select…</option>
            {methods.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
                {item.serverStreaming ? " (stream)" : ""}
                {item.clientStreaming ? " (client stream)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="intruder-label">
        Request JSON
        <textarea className="mono" rows={6} value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} />
      </label>
      <div className="wb-stream-log">
        {visibleFrames.map((item) => (
          <div key={item.id} className={`wb-stream-line ${item.dir}`}>
            <span className="wb-muted">{item.dir}</span> {item.text}
          </div>
        ))}
      </div>
      {history.length ? (
        <div className="wb-history-mini">
          <h3 className="wb-sub">gRPC history</h3>
          <ul className="discover-hits">
            {history.slice(0, 8).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSessionId(item.id);
                    setFrames(item.frames);
                  }}
                >
                  {item.title ?? item.url} <span className="wb-muted">{item.frames.length} frames</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
