import { useEffect, useMemo, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { formatRawRequest, parseRawRequest, statusClass } from "../../shared/http";
import {
  compactFlow,
  deleteRepeaterCollection,
  entryToFlow,
  listRepeaterCollections,
  loadRepeaterSession,
  saveRepeaterCollection,
  saveRepeaterSession,
  type RepeaterCollection,
  type RepeaterTabSnapshot,
} from "../../shared/repeaterCollections";
import { HttpViewer } from "./HttpViewer";
import { MonacoView } from "./MonacoView";
import { EmptyState } from "./EmptyState";

type RepeaterTab = {
  id: string;
  name: string;
  url: string;
  raw: string;
  sending: boolean;
  error: string | null;
  history: FlowDetail[];
  selectedIndex: number;
  pins: Record<string, boolean>;
  comments: Record<string, string>;
};

type Props = {
  draft: FlowDetail | null;
  onDraftConsumed: () => void;
};

function emptyTab(n: number, draft?: FlowDetail | null): RepeaterTab {
  return {
    id: crypto.randomUUID(),
    name: draft ? `${draft.method} ${draft.path}` : `Tab ${n}`,
    url: draft?.url ?? "",
    raw: draft ? formatRawRequest(draft) : "GET / HTTP/1.1\nHost: \n\n",
    sending: false,
    error: null,
    history: [],
    selectedIndex: -1,
    pins: {},
    comments: {},
  };
}

function fromSnapshot(snap: RepeaterTabSnapshot): RepeaterTab {
  const history = snap.history.map(entryToFlow);
  const pins: Record<string, boolean> = {};
  const comments: Record<string, string> = {};
  for (const entry of snap.history) {
    if (entry.pinned) {
      pins[entry.id] = true;
    }
    if (entry.comment) {
      comments[entry.id] = entry.comment;
    }
  }
  return {
    id: snap.id,
    name: snap.name,
    url: snap.url,
    raw: snap.raw,
    sending: false,
    error: null,
    history,
    selectedIndex: snap.selectedIndex,
    pins,
    comments,
  };
}

function toSnapshot(tab: RepeaterTab): RepeaterTabSnapshot {
  return {
    id: tab.id,
    name: tab.name,
    url: tab.url,
    raw: tab.raw,
    selectedIndex: tab.selectedIndex,
    history: tab.history.map((flow) =>
      compactFlow(flow, { pinned: tab.pins[flow.id], comment: tab.comments[flow.id] }),
    ),
  };
}

export function RepeaterView({ draft, onDraftConsumed }: Props) {
  const [tabs, setTabs] = useState<RepeaterTab[]>(() => {
    const saved = loadRepeaterSession();
    return saved.length ? saved.map(fromSnapshot) : [emptyTab(1)];
  });
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? "");
  const [collections, setCollections] = useState<RepeaterCollection[]>(() => listRepeaterCollections());

  useEffect(() => {
    saveRepeaterSession(tabs.map(toSnapshot));
  }, [tabs]);

  useEffect(() => {
    if (!draft) {
      return;
    }
    const tab = emptyTab(tabs.length + 1, draft);
    setTabs((current) => [...current, tab]);
    setActiveId(tab.id);
    onDraftConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  const update = (patch: Partial<RepeaterTab>) => {
    if (!active) {
      return;
    }
    setTabs((current) =>
      current.map((tab) => (tab.id === active.id ? { ...tab, ...patch } : tab)),
    );
  };

  const selected = useMemo(() => {
    if (!active || active.selectedIndex < 0) {
      return null;
    }
    return active.history[active.selectedIndex] ?? null;
  }, [active]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void send();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const send = async () => {
    if (!active || !window.lurkwire) {
      return;
    }
    update({ sending: true, error: null });
    try {
      const parsed = parseRawRequest(active.raw, active.url);
      if (active.url) {
        parsed.url = deriveUrl(active.url, parsed.url);
      }
      const result = await window.lurkwire.sendRepeater(parsed);
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== active.id) {
            return tab;
          }
          const history = [result, ...tab.history];
          return {
            ...tab,
            sending: false,
            history,
            selectedIndex: 0,
            name: `${parsed.method} ${new URL(parsed.url).pathname}`,
          };
        }),
      );
    } catch (err) {
      update({
        sending: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (!active) {
    return null;
  }

  return (
    <main className="workbench">
      <div className="workbench-toolbar repeater-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === active.id ? "chip active" : "chip"}
            onClick={() => setActiveId(tab.id)}
          >
            {tab.name}
            {tabs.length > 1 ? (
              <span
                className="tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  setTabs((current) => {
                    const next = current.filter((item) => item.id !== tab.id);
                    if (activeId === tab.id) {
                      setActiveId(next[0]?.id ?? "");
                    }
                    return next.length ? next : [emptyTab(1)];
                  });
                }}
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => {
            const tab = emptyTab(tabs.length + 1);
            setTabs((current) => [...current, tab]);
            setActiveId(tab.id);
          }}
        >
          +
        </button>
        <select
          value=""
          aria-label="Repeater collections"
          onChange={(event) => {
            const id = event.target.value;
            event.currentTarget.value = "";
            if (!id) {
              return;
            }
            const collection = collections.find((item) => item.id === id);
            if (!collection || collection.tabs.length === 0) {
              return;
            }
            const restored = collection.tabs.map(fromSnapshot);
            setTabs(restored);
            setActiveId(restored[0]?.id ?? "");
          }}
        >
          <option value="">Load collection…</option>
          {collections.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("Name this Repeater collection", active.name);
            if (!name) {
              return;
            }
            setCollections(saveRepeaterCollection(name, tabs.map(toSnapshot)));
          }}
        >
          Save collection
        </button>
        {collections[0] ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete collection “${collections[0].name}”?`)) {
                setCollections(deleteRepeaterCollection(collections[0].id));
              }
            }}
          >
            Delete collection
          </button>
        ) : null}
      </div>

      <div className="repeater-grid">
        <section className="repeater-editor">
          <div className="repeater-url">
            <input
              value={active.url}
              onChange={(event) => update({ url: event.target.value })}
              placeholder="https://example.com/path"
              spellCheck={false}
            />
            <button
              type="button"
              className="primary"
              disabled={active.sending || !active.url}
              onClick={() => void send()}
            >
              {active.sending ? "Sending…" : "Send (Ctrl+Enter)"}
            </button>
          </div>
          <div className="repeater-editor-pane">
            <MonacoView value={active.raw} language="http" readOnly={false} onChange={(value) => update({ raw: value })} />
          </div>
          {active.error ? <div className="banner">{active.error}</div> : null}
        </section>

        <section className="repeater-response">
          <div className="detail-head">
            <div>
              <div className="detail-title">
                {selected ? (
                  <>
                    <span className={statusClass(selected.status)}>
                      {selected.status ?? "—"}
                    </span>{" "}
                    {selected.duration_ms ?? 0} ms · {selected.host}
                  </>
                ) : (
                  "Response"
                )}
              </div>
              <div className="muted">
                {active.history.length} send{active.history.length === 1 ? "" : "s"} in this tab
              </div>
            </div>
            {active.history.length > 1 ? (
              <div className="nav-buttons">
                <button
                  type="button"
                  disabled={active.selectedIndex >= active.history.length - 1}
                  onClick={() => update({ selectedIndex: active.selectedIndex + 1 })}
                >
                  ‹
                </button>
                <button
                  type="button"
                  disabled={active.selectedIndex <= 0}
                  onClick={() => update({ selectedIndex: Math.max(0, active.selectedIndex - 1) })}
                >
                  ›
                </button>
              </div>
            ) : null}
          </div>
          {active.history.length > 0 ? (
            <ul className="repeater-history">
              {active.history.map((item, index) => (
                <li key={item.id} className={index === active.selectedIndex ? "active" : ""}>
                  <button type="button" onClick={() => update({ selectedIndex: index })}>
                    {active.pins[item.id] ? "📌 " : ""}
                    {item.status ?? "—"} {item.method} {item.path}
                    {active.comments[item.id] ? ` — ${active.comments[item.id]}` : ""}
                  </button>
                  <button
                    type="button"
                    title="Pin this send"
                    onClick={() =>
                      update({ pins: { ...active.pins, [item.id]: !active.pins[item.id] } })
                    }
                  >
                    {active.pins[item.id] ? "Unpin" : "Pin"}
                  </button>
                  <button
                    type="button"
                    title="Comment"
                    onClick={() => {
                      const next = window.prompt("Comment this send", active.comments[item.id] ?? "");
                      if (next == null) {
                        return;
                      }
                      update({ comments: { ...active.comments, [item.id]: next } });
                    }}
                  >
                    Note
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selected ? (
            <>
              <p className="muted">
                {selected.duration_ms ?? 0} ms · req {selected.req_len} B · resp {selected.resp_len} B
                {active.comments[selected.id] ? ` · ${active.comments[selected.id]}` : ""}
              </p>
              <HttpViewer flow={selected} />
            </>
          ) : (
            <EmptyState title="No response yet">
              Right-click a request in Traffic or the page and choose Send to Repeater, press Ctrl+R, or paste a raw request here and press Ctrl+Enter.
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}

function deriveUrl(explicit: string, parsed: string): string {
  try {
    const base = new URL(explicit);
    const other = new URL(parsed, base);
    return other.toString();
  } catch {
    return explicit || parsed;
  }
}
