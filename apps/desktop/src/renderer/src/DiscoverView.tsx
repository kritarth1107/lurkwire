import { useMemo, useRef, useState } from "react";
import type { FlowSummary } from "../../shared/types";
import { DEFAULT_WORDLIST, expandWordlist, isInterestingStatus, joinPath, parseWordlist, type DiscoverHit } from "../../shared/discover";
import { endpointsOf, extractJsFindings, isHighConfidence, secretsOf, type ExtractedItem } from "../../shared/jsSecrets";
import { emptyNote } from "../../shared/notes";

type Tab = "paths" | "js";

function decodeBody(base64: string): string {
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

export function DiscoverView({ projectId }: { projectId: string | null }) {
  const [tab, setTab] = useState<Tab>("paths");
  const [base, setBase] = useState("");
  const [words, setWords] = useState(DEFAULT_WORDLIST.join("\n"));
  const [extensions, setExtensions] = useState("");
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(false);
  const [hits, setHits] = useState<DiscoverHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jsSource, setJsSource] = useState("");
  const [extracted, setExtracted] = useState<ExtractedItem[]>([]);
  const [jsBusy, setJsBusy] = useState(false);

  const interesting = useMemo(() => hits.filter((item) => item.interesting), [hits]);

  async function run() {
    setBusy(true);
    cancelRef.current = false;
    setError(null);
    setHits([]);
    try {
      const list = expandWordlist(parseWordlist(words), extensions.split(/[\s,]+/).filter(Boolean));
      const next: DiscoverHit[] = [];
      for (const word of list) {
        if (cancelRef.current) {
          break;
        }
        const url = joinPath(base, word);
        try {
          const flow = await window.lurkwire.activeSend({
            project_id: projectId ?? undefined,
            method: "GET",
            url,
            headers: [],
            source: "discover",
          });
          const hit: DiscoverHit = {
            url,
            word,
            status: flow.status,
            length: flow.resp_len,
            interesting: isInterestingStatus(flow.status),
            flowId: flow.id,
          };
          next.push(hit);
          setHits([...next]);
        } catch (err) {
          next.push({ url, word, status: null, length: 0, interesting: false, error: err instanceof Error ? err.message : String(err) });
          setHits([...next]);
          if (/kill switch|out of scope|not in scope/i.test(String(err))) {
            setError(err instanceof Error ? err.message : String(err));
            break;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function mineCaptured() {
    setJsBusy(true);
    setError(null);
    try {
      const list = await window.lurkwire.listFlows({ project_id: projectId ?? undefined, limit: 250, hide_static: false });
      const scripts = list.items.filter((item: FlowSummary) => (item.mime ?? "").includes("javascript") || item.path.endsWith(".js"));
      const chunks: string[] = [jsSource];
      for (const item of scripts.slice(0, 40)) {
        try {
          const raw = await window.lurkwire.getFlowBody(item.id, "resp");
          chunks.push(`\n/* ${item.url} */\n${decodeBody(raw)}`);
        } catch {
          // skip
        }
      }
      const source = chunks.join("\n");
      setJsSource(source);
      setExtracted(extractJsFindings(source));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setJsBusy(false);
    }
  }

  async function fileSecrets(items: ExtractedItem[]) {
    if (!items.length) {
      return;
    }
    const store = await window.lurkwire.notesGet();
    const existing = new Set(store.notes.map((note) => `${note.title}:${note.body}`));
    const notes = items
      .map((item) => {
        const note = emptyNote(crypto.randomUUID());
        note.title = `${item.kind} in captured JavaScript`;
        note.severity = item.kind === "privateKey" || item.kind === "awsAccessKey" ? "high" : "medium";
        note.tags = ["js-miner", item.kind];
        note.body = `Kind: ${item.kind}\nValue: ${item.value}\nLine: ${item.line}\nContext: ${item.context}`;
        return note;
      })
      .filter((note) => !existing.has(`${note.title}:${note.body}`));
    if (notes.length) {
      await window.lurkwire.notesSave({ ...store, notes: [...notes, ...store.notes] });
    }
  }

  return (
    <div className="workbench">
      <div className="workbench-toolbar">
        <button type="button" className={tab === "paths" ? "chip active" : "chip"} onClick={() => setTab("paths")}>
          Paths
        </button>
        <button type="button" className={tab === "js" ? "chip active" : "chip"} onClick={() => setTab("js")}>
          JS miner
        </button>
      </div>
      {tab === "paths" ? (
        <>
          <p className="hint">
            Directory and content discovery only runs against hosts in scope, through the proxy rate limiter and kill switch.
          </p>
          <div className="repeater-url">
            <input value={base} onChange={(event) => setBase(event.target.value)} placeholder="https://example.com" spellCheck={false} aria-label="Base URL" />
            <button type="button" className="primary" disabled={busy || !base.trim()} onClick={() => void run()}>
              {busy ? "Running…" : "Run"}
            </button>
            {busy ? (
              <button type="button" onClick={() => { cancelRef.current = true; }}>
                Stop
              </button>
            ) : null}
          </div>
          <label className="intruder-label">
            Extensions (optional)
            <input value={extensions} onChange={(event) => setExtensions(event.target.value)} placeholder=".json .bak .old" spellCheck={false} />
          </label>
          <label className="intruder-label">
            Wordlist
            <textarea className="mono" rows={8} value={words} onChange={(event) => setWords(event.target.value)} spellCheck={false} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <p className="muted">
            {hits.length} tried, {interesting.length} interesting
          </p>
          <ul className="discover-hits">
            {hits.filter((item) => item.interesting || item.error).map((item) => (
              <li key={item.url}>
                <strong>{item.status ?? "err"}</strong> {item.url} <span className="muted">{item.error ?? `${item.length} b`}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="hint">Extract endpoints and likely secrets from captured JavaScript or a pasted script.</p>
          <div className="intruder-actions">
            <button type="button" className="primary" disabled={jsBusy} onClick={() => void mineCaptured()}>
              {jsBusy ? "Reading flows…" : "Mine captured JS"}
            </button>
            <button type="button" onClick={() => setExtracted(extractJsFindings(jsSource))}>
              Scan paste
            </button>
          </div>
          <textarea className="mono" rows={8} value={jsSource} onChange={(event) => setJsSource(event.target.value)} placeholder="Paste a script, or mine captured flows." spellCheck={false} />
          {error ? <p className="error">{error}</p> : null}
          <h3 className="wb-sub">Endpoints ({endpointsOf(extracted).length})</h3>
          <ul className="discover-hits">
            {endpointsOf(extracted).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {secretsOf(extracted).some((item) => isHighConfidence(item.kind)) ? (
            <div className="intruder-actions">
              <button
                type="button"
                onClick={() => void fileSecrets(secretsOf(extracted).filter((item) => isHighConfidence(item.kind)))}
              >
                Save high-confidence secrets to Notes
              </button>
            </div>
          ) : null}
          <h3 className="wb-sub">Secrets ({secretsOf(extracted).length})</h3>
          <ul className="discover-hits">
            {secretsOf(extracted).map((item, index) => (
              <li key={`${item.kind}-${index}`}>
                <strong>{item.kind}</strong> {item.value} <span className="muted">L{item.line}</span>
                {isHighConfidence(item.kind) ? (
                  <button type="button" onClick={() => void fileSecrets([item])}>
                    Accept
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
