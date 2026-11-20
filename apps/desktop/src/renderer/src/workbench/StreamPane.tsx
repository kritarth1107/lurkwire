import { useEffect, useState } from "react";
import type { WbRequest } from "../../../shared/workbench";

type Frame = { sessionId: string; id: string; at: number; dir: "in" | "out" | "sys"; text: string };

export function StreamPane({ request }: { request: WbRequest }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const kind = request.protocol === "sse" ? "sse" : "websocket";

  useEffect(() => {
    return window.lurkwire.onWorkbenchStream((frame) => {
      setFrames((current) => (current.length > 400 ? [...current.slice(-300), frame] : [...current, frame]));
    });
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    setFrames([]);
    try {
      if (sessionId) {
        await window.lurkwire.workbenchStreamClose(sessionId);
      }
      const state = await window.lurkwire.getState();
      const opened = await window.lurkwire.workbenchStreamOpen({
        kind,
        url: request.url,
        protocols: request.ws?.protocols,
        headers: request.headers.filter((item) => item.enabled && item.key).map((item) => ({ name: item.key, value: item.value })),
        projectId: state.currentProjectId,
      });
      setSessionId(opened.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (sessionId) {
      await window.lurkwire.workbenchStreamClose(sessionId);
      setSessionId(null);
    }
  }

  return (
    <div className="wb-stream">
      <div className="wb-stream-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void connect()}>
          {busy ? "Connecting…" : sessionId ? "Reconnect" : "Connect"}
        </button>
        <button type="button" disabled={!sessionId} onClick={() => void close()}>
          Close
        </button>
        <span className="wb-muted">{kind === "sse" ? "Server-Sent Events" : "WebSocket"} {sessionId ? "connected" : "idle"}</span>
      </div>
      {kind === "websocket" ? (
        <div className="wb-stream-send">
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && sessionId && message) {
                event.preventDefault();
                void window.lurkwire.workbenchStreamSend(sessionId, message).then(() => setMessage(""));
              }
            }}
            placeholder="Message to send"
            spellCheck={false}
          />
          <button
            type="button"
            disabled={!sessionId || !message}
            onClick={() => void window.lurkwire.workbenchStreamSend(sessionId!, message).then(() => setMessage(""))}
          >
            Send
          </button>
        </div>
      ) : (
        <p className="wb-muted">Incoming events appear below. Headers on this request are sent with the SSE subscribe call.</p>
      )}
      {error ? <p className="error">{error}</p> : null}
      <div className="wb-stream-log">
        {frames.filter((item) => !sessionId || item.sessionId === sessionId).map((item) => (
          <div key={item.id} className={`wb-stream-line ${item.dir}`}>
            <span className="wb-muted">{item.dir}</span> {item.text}
          </div>
        ))}
      </div>
    </div>
  );
}
