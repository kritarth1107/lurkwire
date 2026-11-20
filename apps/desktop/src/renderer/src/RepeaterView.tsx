import { useEffect, useMemo, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { formatRawRequest, parseRawRequest, statusClass } from "../../shared/http";

type RepeaterTab = {
  id: string;
  name: string;
  url: string;
  raw: string;
  sending: boolean;
  error: string | null;
  history: FlowDetail[];
  selectedIndex: number;
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
  };
}

export function RepeaterView({ draft, onDraftConsumed }: Props) {
  const [tabs, setTabs] = useState<RepeaterTab[]>(() => [emptyTab(1)]);
  const [activeId, setActiveId] = useState(tabs[0].id);

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
              {active.sending ? "Sending…" : "Send"}
            </button>
          </div>
          <textarea
            className="raw-editor"
            value={active.raw}
            onChange={(event) => update({ raw: event.target.value })}
            spellCheck={false}
          />
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
          {selected ? (
            <>
              <pre className="headers">
                {selected.resp_headers
                  .map((header) => `${header.name}: ${header.value}`)
                  .join("\n") || "(no headers)"}
              </pre>
              <pre className="body">
                {selected.resp_preview ||
                  (selected.resp_blob ? "(binary body)" : "(empty)")}
              </pre>
            </>
          ) : (
            <div className="empty-pane">
              Edit the request and press Send. The human always sends.
            </div>
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
