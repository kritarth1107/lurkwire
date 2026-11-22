import { useEffect, useState } from "react";
import type { AttackType, FlowDetail, IntruderJob } from "../../shared/types";
import { INTRUDER_PRESETS, presetPayloads } from "../../shared/intruderPresets";
import { deletePayloadList, listPayloadLists, savePayloadList, type SavedPayloadList } from "../../shared/intruderLists";
import { parseHeaderBlock, statusClass } from "../../shared/http";
import { EmptyState } from "./EmptyState";

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.length > 0);
}

export function IntruderView({
  projectId,
  draft,
  onDraftConsumed,
  onSendToRepeater,
}: {
  projectId: string | null;
  draft?: FlowDetail | null;
  onDraftConsumed?: () => void;
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
  const [sortKey, setSortKey] = useState<"index" | "status" | "length" | "duration_ms">("index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [savedLists, setSavedLists] = useState<SavedPayloadList[]>(() => listPayloadLists());

  useEffect(() => {
    if (!draft) {
      return;
    }
    setMethod(draft.method);
    setUrl(draft.url);
    setHeaders(draft.req_headers.map((h) => `${h.name}: ${h.value}`).join("\n") + "\n");
    setBody(draft.req_preview ?? "");
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

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
    const payloads = (attack === "pitchfork" || attack === "cluster_bomb" ? lists : lists.slice(0, 1)).map(parseLines);
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

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((value) => (value === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "index" ? "asc" : "desc");
    }
  }

  const results = [...(job?.results ?? [])].sort((a, b) => {
    const av = Number(a[sortKey] ?? 0);
    const bv = Number(b[sortKey] ?? 0);
    return sortDir === "asc" ? av - bv : bv - av;
  });
  const lengths = results.map((row) => row.length);
  const median = lengths.length
    ? [...lengths].sort((a, b) => a - b)[Math.floor(lengths.length / 2)]
    : 0;
  const statusCounts = new Map<number, number>();
  for (const row of results) {
    if (row.status != null) {
      statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    }
  }
  const commonStatus = [...statusCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  function isAnomaly(row: (typeof results)[number]): boolean {
    if (row.grep_hit) {
      return true;
    }
    if (commonStatus != null && row.status != null && row.status !== commonStatus) {
      return true;
    }
    return median > 0 && Math.abs(row.length - median) >= Math.max(32, median * 0.25);
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
      {!draft && !job ? (
        <EmptyState title="No request loaded">
          Right-click a request and choose Send to Intruder, or press Ctrl+I. Then select text and click Mark §, pick an attack type, and start. Hosts must be in scope.
        </EmptyState>
      ) : null}
      <p className="hint">
        Wrap each insertion point with §, for example <code>/user/§id§</code>. Select text in the URL, headers, or body and click Mark §. Cluster bomb runs the cartesian product of payload sets (capped).
      </p>
      <div className="workbench-toolbar">
        <button type="button" onClick={() => markSelection(setUrl, url)}>Mark § in URL</button>
        <button type="button" onClick={() => markSelection(setHeaders, headers)}>Mark § in headers</button>
        <button type="button" onClick={() => markSelection(setBody, body)}>Mark § in body</button>
      </div>
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
            <option value="cluster_bomb">Cluster bomb</option>
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
          Payloads {attack === "pitchfork" || attack === "cluster_bomb" ? `for position ${index + 1}` : "(one per line)"}
          <select
            defaultValue=""
            onChange={(event) => {
              const id = event.target.value;
              event.currentTarget.value = "";
              if (!id) {
                return;
              }
              const next = [...lists];
              next[index] = presetPayloads(id).join("\n");
              setLists(next);
            }}
            aria-label="Payload preset"
          >
            <option value="">Load a preset…</option>
            {INTRUDER_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            aria-label="Saved payload list"
            onChange={(event) => {
              const id = event.target.value;
              event.currentTarget.value = "";
              if (!id) {
                return;
              }
              const saved = savedLists.find((item) => item.id === id);
              if (!saved) {
                return;
              }
              const next = [...lists];
              next[index] = saved.text;
              setLists(next);
            }}
          >
            <option value="">Saved lists…</option>
            {savedLists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("Name this payload list", `List ${index + 1}`);
              if (!name) {
                return;
              }
              setSavedLists(savePayloadList(name, list));
            }}
          >
            Save list
          </button>
          {savedLists[0] ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete saved list “${savedLists[0].name}”?`)) {
                  setSavedLists(deletePayloadList(savedLists[0].id));
                }
              }}
            >
              Delete list
            </button>
          ) : null}
          <label className="file-btn">
            Load from file
            <input
              type="file"
              accept=".txt,.csv,text/plain"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) {
                  return;
                }
                void file.text().then((text) => {
                  const next = [...lists];
                  next[index] = text.replace(/\r\n/g, "\n").trim();
                  setLists(next);
                });
              }}
            />
          </label>
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
      {attack === "pitchfork" || attack === "cluster_bomb" ? (
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
              <th><button type="button" className="linkish" onClick={() => toggleSort("status")}>Status</button></th>
              <th><button type="button" className="linkish" onClick={() => toggleSort("length")}>Len</button></th>
              <th><button type="button" className="linkish" onClick={() => toggleSort("duration_ms")}>ms</button></th>
              <th>Grep</th>
            </tr>
          </thead>
          <tbody>
            {results.length > 0 ? (
              results.map((row) => (
                <tr
                  key={row.index}
                  className={row.grep_hit ? "selected" : isAnomaly(row) ? "anomaly" : undefined}
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


function markSelection(setter: (value: string) => void, current: string) {
  const target = document.activeElement;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    const picked = window.getSelection()?.toString() || "";
    if (!picked) {
      return;
    }
    setter(current.replace(picked, `§${picked}§`));
    return;
  }
  const start = target.selectionStart ?? 0;
  const end = target.selectionEnd ?? 0;
  if (start === end) {
    return;
  }
  const next = `${current.slice(0, start)}§${current.slice(start, end)}§${current.slice(end)}`;
  setter(next);
}
