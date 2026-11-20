import { useEffect, useState } from "react";
import type { AttackType, FlowDetail, IntruderJob } from "../../shared/types";
import { parseHeaderBlock, statusClass } from "../../shared/http";

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0);
}

export function IntruderView({
  projectId,
  onSendToRepeater,
}: {
  projectId: string | null;
  onSendToRepeater: (flow: FlowDetail) => void;
}) {
  const [method, setMethod] = useState("GET");
  const [url, setUrl] = useState("https://example.com/search?q=§term§");
  const [headers, setHeaders] = useState("Accept: */*\n");
  const [body, setBody] = useState("");
  const [attack, setAttack] = useState<AttackType>("sniper");
  const [lists, setLists] = useState<string[]>(["admin\nroot\nguest"]);
  const [grep, setGrep] = useState("");
  const [job, setJob] = useState<IntruderJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "running";

  useEffect(() => {
    if (!job || job.status !== "running") {
      return;
    }
    const timer = window.setInterval(() => {
      void window.lurkwire.getIntruder(job.id).then(setJob).catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
    }, 300);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  async function start() {
    setError(null);
    const payloads = (attack === "pitchfork" ? lists : lists.slice(0, 1)).map(parseLines);
    if (payloads.some((list) => list.length === 0)) {
      setError("Add at least one payload per list.");
      return;
    }
    try {
      const started = await window.lurkwire.startIntruder({
        project_id: projectId ?? undefined,
        method,
        url,
        headers: parseHeaderBlock(headers),
        body: body || undefined,
        attack,
        payloads,
        grep: grep.trim() || undefined,
      });
      setJob(started);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function stop() {
    if (!job) {
      return;
    }
    try {
      setJob(await window.lurkwire.stopIntruder(job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function openResult(flowId: string | null) {
    if (!flowId) {
      return;
    }
    const flow = await window.lurkwire.getFlow(flowId);
    onSendToRepeater(flow);
  }

  return (
    <div className="intruder">
      <p className="hint">
        Wrap each insertion point with §, for example <code>/user/§id§</code>. Attacks stay in
        scope, honor the rate cap, and stop when the kill switch is on.
      </p>
      <div className="repeater-url">
        <input
          className="method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          aria-label="Method"
        />
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label="URL template"
          spellCheck={false}
        />
      </div>
      <label className="intruder-label">
        Headers
        <textarea
          className="mono"
          rows={4}
          value={headers}
          onChange={(event) => setHeaders(event.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="intruder-label">
        Body
        <textarea
          className="mono"
          rows={3}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="intruder-controls">
        <label>
          Attack
          <select
            value={attack}
            onChange={(event) => setAttack(event.target.value as AttackType)}
          >
            <option value="sniper">Sniper</option>
            <option value="battering_ram">Battering ram</option>
            <option value="pitchfork">Pitchfork</option>
          </select>
        </label>
        <label>
          Grep
          <input
            type="text"
            value={grep}
            onChange={(event) => setGrep(event.target.value)}
            placeholder="match in response"
          />
        </label>
      </div>
      {lists.map((list, index) => (
        <label className="intruder-label" key={index}>
          Payloads {attack === "pitchfork" ? `for position ${index + 1}` : "(one per line)"}
          <textarea
            className="mono"
            rows={5}
            value={list}
            onChange={(event) => {
              const next = [...lists];
              next[index] = event.target.value;
              setLists(next);
            }}
            spellCheck={false}
          />
        </label>
      ))}
      {attack === "pitchfork" ? (
        <div className="intruder-actions">
          <button type="button" onClick={() => setLists([...lists, ""])}>
            Add list
          </button>
          {lists.length > 1 ? (
            <button type="button" onClick={() => setLists(lists.slice(0, -1))}>
              Remove list
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="intruder-actions">
        {running ? (
          <button type="button" className="danger" onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className="primary" onClick={() => void start()}>
            Start attack
          </button>
        )}
        {job ? (
          <span className="muted">
            {job.status} · {job.finished}/{job.total}
          </span>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
      <div className="intruder-results">
        <table className="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Payload</th>
              <th>Pos</th>
              <th>Status</th>
              <th>Len</th>
              <th>ms</th>
              <th>Grep</th>
            </tr>
          </thead>
          <tbody>
            {job && job.results.length > 0 ? (
              job.results.map((row) => (
                <tr
                  key={row.index}
                  className={row.grep_hit ? "selected" : undefined}
                  onClick={() => void openResult(row.flow_id)}
                  title={row.error ?? undefined}
                >
                  <td>{row.index}</td>
                  <td className="path">{row.payload}</td>
                  <td>{row.position ?? "—"}</td>
                  <td className={statusClass(row.status)}>{row.status ?? row.error ?? "—"}</td>
                  <td>{row.length}</td>
                  <td>{row.duration_ms}</td>
                  <td>{row.grep_hit ? "yes" : ""}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="empty" colSpan={7}>
                  Results appear here. Click a row to send that flow to Repeater.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
