import { useEffect, useState } from "react";
import type { StreamSessionRecord } from "../../shared/workbench/streamHistory";
import { EmptyState } from "./EmptyState";

export function WebSocketView() {
  const [sessions, setSessions] = useState<StreamSessionRecord[]>([]);
  const [selected, setSelected] = useState<StreamSessionRecord | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await window.lurkwire.workbenchStreamHistory();
    setSessions(data.sessions);
    setSelected((current) => data.sessions.find((item) => item.id === current?.id) ?? current);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function replay(session: StreamSessionRecord) {
    setError(null);
    try {
      if (replayId) {
        await window.lurkwire.workbenchStreamClose(replayId);
      }
      const state = await window.lurkwire.getState();
      const opened = await window.lurkwire.workbenchStreamOpen({
        kind: session.kind === "grpc" ? "websocket" : session.kind,
        url: session.url,
        projectId: state.currentProjectId,
      });
      setReplayId(opened.id);
      const outgoing = session.frames.filter((frame) => frame.dir === "out");
      for (const frame of outgoing) {
        await window.lurkwire.workbenchStreamSend(opened.id, frame.text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="tool-split">
      <div className="tool-list">
        <div className="workbench-toolbar">
          <button type="button" onClick={() => void refresh()}>
            Refresh
          </button>
          <button type="button" onClick={() => void window.lurkwire.workbenchStreamHistoryClear().then((data) => setSessions(data.sessions))}>
            Clear history
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {sessions.length ? (
          <table className="history-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>URL</th>
                <th>Frames</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.id} className={selected?.id === item.id ? "selected" : undefined} onClick={() => setSelected(item)}>
                  <td>{item.kind}</td>
                  <td className="path">{item.url}</td>
                  <td>{item.frames.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No WebSocket or SSE sessions yet">
            Open a page that uses WebSockets, or connect from the API Workbench stream pane. Sessions are listed here so you can inspect frames and replay outgoing messages.
          </EmptyState>
        )}
      </div>
      <div className="tool-detail">
        {selected ? (
          <>
            <div className="workbench-toolbar">
              <strong>{selected.kind}</strong>
              <span className="muted">{selected.url}</span>
              <button type="button" className="primary" onClick={() => void replay(selected)}>
                Replay outgoing
              </button>
            </div>
            <pre className="mono evidence">
              {selected.frames
                .map((frame) => `[${frame.dir}] ${frame.text}`)
                .join("\n") || "(no frames)"}
            </pre>
            {replayId ? (
              <div className="repeater-url">
                <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Send a frame" />
                <button
                  type="button"
                  onClick={() => {
                    void window.lurkwire.workbenchStreamSend(replayId, message).then(() => setMessage(""));
                  }}
                >
                  Send
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">Select a session to inspect frames.</p>
        )}
      </div>
    </div>
  );
}
