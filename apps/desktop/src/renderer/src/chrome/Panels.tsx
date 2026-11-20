import { useEffect, useRef, useState } from "react";
import { History, Repeat, ShieldOff, Crosshair, KeyRound, Radar, Globe, MessageSquare, Settings, Minus, Plus } from "lucide-react";
import type {
  AppSnapshot,
  DownloadInfo,
  InterceptState,
  PanelContext,
  PanelKind,
} from "../../../shared/types";
import { projectColor } from "../../../shared/projectColor";
import { useAppState } from "../useAppState";

export function PanelApp() {
  const state = useAppState();
  const [ctx, setCtx] = useState<PanelContext | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.body.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    void window.lurkwire.getPanelContext().then(setCtx);
  }, []);

  useEffect(() => {
    if (!root.current || !ctx) {
      return;
    }
    const report = () => {
      const rect = root.current?.getBoundingClientRect();
      if (rect) {
        void window.lurkwire.resizePanel(Math.ceil(rect.width), Math.ceil(rect.height));
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [ctx]);

  const kind: PanelKind | undefined = ctx?.kind;
  return (
    <div className="panel-root" ref={root} data-theme={state.theme}>
      {kind === "appmenu" ? <AppMenu state={state} /> : null}
      {kind === "downloads" ? <DownloadsMenu /> : null}
      {kind === "alltabs" ? <AllTabs state={state} /> : null}
      {kind === "identity" ? <Identity payload={ctx?.payload ?? {}} state={state} /> : null}
      {kind === "lurkwire" ? <LurkwireMenu /> : null}
      {kind === "intercept" ? <InterceptMenu /> : null}
      {kind === "project" ? <ProjectMenu state={state} /> : null}
      {kind === "tabmenu" ? <TabMenu payload={ctx?.payload ?? {}} /> : null}
      {kind === "pagemenu" ? <PageMenu payload={ctx?.payload ?? {}} /> : null}
      {!kind ? <div className="placeholder">Loading…</div> : null}
    </div>
  );
}

function close(): void {
  void window.lurkwire.closePanel();
}

function AppMenu({ state }: { state: AppSnapshot }) {
  const zoom = Math.round((state.zoomFactor || 1) * 100);
  return (
    <>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.newTab(); close(); }}>
        New tab <kbd>Ctrl+T</kbd>
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.reopenTab(); close(); }}>
        Reopen closed tab <kbd>Ctrl+Shift+T</kbd>
      </button>
      <div className="menu-sep" />
      <div className="menu-label">Zoom</div>
      <div className="zoom-row">
        <button type="button" aria-label="Zoom out" onClick={() => void window.lurkwire.adjustZoom(-0.1)}>
          <Minus size={14} />
        </button>
        <span>{zoom}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => void window.lurkwire.adjustZoom(0.1)}>
          <Plus size={14} />
        </button>
        <button type="button" onClick={() => void window.lurkwire.resetZoom()}>Reset</button>
      </div>
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.setTool("history"); close(); }}>
        <History size={16} /> History <kbd>Ctrl+H</kbd>
      </button>
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          void window.lurkwire.setPrefs({ bookmarksBar: !state.prefs.bookmarksBar });
          close();
        }}
      >
        {state.prefs.bookmarksBar ? "Hide bookmarks toolbar" : "Show bookmarks toolbar"} <kbd>Ctrl+B</kbd>
      </button>
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          void window.lurkwire.setPrefs({ sidebarOpen: !state.prefs.sidebarOpen });
          close();
        }}
      >
        {state.prefs.sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      </button>
      <div className="menu-sep" />
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          void window.lurkwire.requestFind();
          close();
        }}
      >
        Find in page <kbd>Ctrl+F</kbd>
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.setTool("settings"); close(); }}>
        <Settings size={16} /> Settings <kbd>Ctrl+,</kbd>
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.openDevTools(); close(); }}>
        Page Inspector <kbd>Ctrl+Shift+I</kbd>
      </button>
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.windowClose(); close(); }}>
        Quit
      </button>
    </>
  );
}

function DownloadsMenu() {
  const [items, setItems] = useState<DownloadInfo[]>([]);
  useEffect(() => {
    void window.lurkwire.listDownloads().then(setItems);
    return window.lurkwire.onDownloads(setItems);
  }, []);
  if (items.length === 0) {
    return <div className="placeholder">No downloads yet.</div>;
  }
  return (
    <>
      {items.map((item) => {
        const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
        return (
          <div key={item.id} className="download-row">
            <div>
              <div className="download-name">{item.filename}</div>
              <div className="download-meta">
                {item.state === "progressing" ? `${pct}%` : item.state}
              </div>
            </div>
            <div>
              {item.state === "progressing" ? (
                <button type="button" className="menu-item" onClick={() => void window.lurkwire.cancelDownload(item.id)}>
                  Cancel
                </button>
              ) : item.path ? (
                <button type="button" className="menu-item" onClick={() => void window.lurkwire.showDownload(item.id)}>
                  Show
                </button>
              ) : null}
            </div>
            {item.state === "progressing" ? (
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

function AllTabs({ state }: { state: AppSnapshot }) {
  const [q, setQ] = useState("");
  const filtered = state.tabs.filter((tab) =>
    (tab.title + tab.url).toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div style={{ padding: "4px 10px 8px" }}>
        <input
          style={{ width: "100%", height: 28, border: "1px solid var(--separator)", borderRadius: 4, background: "var(--field)", padding: "0 8px" }}
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search tabs"
          autoFocus
        />
      </div>
      {filtered.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="menu-item"
          onClick={() => {
            void window.lurkwire.switchTab(tab.id);
            close();
          }}
        >
          <span
            style={{ width: 8, height: 8, borderRadius: 8, background: projectColor(tab.projectId), flex: "0 0 8px" }}
          />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tab.title || "New Tab"}
          </span>
        </button>
      ))}
      {filtered.length === 0 ? <div className="placeholder">No tabs match.</div> : null}
    </>
  );
}

function Identity({
  payload,
  state,
}: {
  payload: Record<string, unknown>;
  state: AppSnapshot;
}) {
  const url = String(payload.url ?? "");
  const secure = Boolean(payload.secure);
  return (
    <div className="identity-card">
      <h3>{secure ? "Connection is secure" : url ? "Connection is not secure" : "New Tab"}</h3>
      <p>{url || "This is a built-in Lurkwire page."}</p>
      <p>HTTPS is intercepted with a per-install CA trusted only inside this app.</p>
      {state.proxy.fingerprint ? <div className="mono">{state.proxy.fingerprint}</div> : null}
    </div>
  );
}

function LurkwireMenu() {
  const tools = [
    { id: "history", label: "History", icon: History },
    { id: "intercept", label: "Intercept", icon: ShieldOff },
    { id: "repeater", label: "Repeater", icon: Repeat },
    { id: "intruder", label: "Intruder", icon: Crosshair },
    { id: "decode", label: "Decode", icon: KeyRound },
    { id: "scanner", label: "Scanner", icon: Radar },
    { id: "recon", label: "Recon", icon: Globe },
    { id: "ai", label: "AI", icon: MessageSquare },
  ] as const;
  return (
    <>
      <div className="menu-label">Lurkwire</div>
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="menu-item"
          onClick={() => {
            void window.lurkwire.setTool(tool.id);
            close();
          }}
        >
          <tool.icon size={16} /> {tool.label}
        </button>
      ))}
    </>
  );
}

function InterceptMenu() {
  const [state, setState] = useState<InterceptState | null>(null);
  useEffect(() => {
    void window.lurkwire.getIntercept().then(setState);
  }, []);
  if (!state) {
    return <div className="placeholder">Loading…</div>;
  }
  const save = (patch: Partial<InterceptState["config"]>) => {
    void window.lurkwire.setIntercept({ ...state.config, ...patch }).then(setState);
  };
  return (
    <div style={{ padding: "8px 14px 12px" }}>
      <label className="check">
        <input type="checkbox" checked={state.config.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
        Intercept is {state.config.enabled ? "on" : "off"}
      </label>
      <label className="check">
        <input type="checkbox" checked={state.config.requests} onChange={(e) => save({ requests: e.target.checked })} />
        Requests
      </label>
      <label className="check">
        <input type="checkbox" checked={state.config.responses} onChange={(e) => save({ responses: e.target.checked })} />
        Responses
      </label>
    </div>
  );
}

function ProjectMenu({ state }: { state: AppSnapshot }) {
  const [name, setName] = useState("");
  return (
    <>
      <div className="menu-label">Projects</div>
      {state.projects.map((project) => (
        <button
          key={project.id}
          type="button"
          className="menu-item"
          onClick={() => {
            void window.lurkwire.setProject(project.id);
            close();
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: 10, background: projectColor(project.id) }} />
          {project.name}
          {project.id === state.currentProjectId ? <kbd>current</kbd> : null}
        </button>
      ))}
      <div className="menu-sep" />
      <div style={{ display: "flex", gap: 6, padding: "4px 14px 8px" }}>
        <input
          style={{ flex: 1, height: 26, border: "1px solid var(--separator)", borderRadius: 4, background: "var(--field)", padding: "0 6px" }}
          value={name}
          placeholder="New project"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              void window.lurkwire.createProject(name.trim());
              close();
            }
          }}
        />
      </div>
    </>
  );
}

function TabMenu({ payload }: { payload: Record<string, unknown> }) {
  const id = String(payload.tabId ?? "");
  const pinned = Boolean(payload.pinned);
  return (
    <>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.newTab(); close(); }}>
        New tab
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.reload(); close(); }}>
        Reload tab
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.duplicateTab(id); close(); }}>
        Duplicate tab
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.pinTab(id, !pinned); close(); }}>
        {pinned ? "Unpin tab" : "Pin tab"}
      </button>
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.closeTab(id); close(); }}>
        Close tab
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.closeOtherTabs(id); close(); }}>
        Close other tabs
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.closeTabsToRight(id); close(); }}>
        Close tabs to the right
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.reopenTab(); close(); }}>
        Reopen closed tab
      </button>
    </>
  );
}

function PageMenu({ payload }: { payload: Record<string, unknown> }) {
  const link = String(payload.linkURL ?? "");
  const selection = String(payload.selectionText ?? "");
  const canGoBack = Boolean(payload.canGoBack);
  const canGoForward = Boolean(payload.canGoForward);
  const canCopy = Boolean(payload.canCopy);
  const canPaste = Boolean(payload.canPaste);
  const canCut = Boolean(payload.canCut);
  const isEditable = Boolean(payload.isEditable);
  return (
    <>
      <button type="button" className="menu-item" disabled={!canGoBack} onClick={() => { void window.lurkwire.back(); close(); }}>
        Back
      </button>
      <button type="button" className="menu-item" disabled={!canGoForward} onClick={() => { void window.lurkwire.forward(); close(); }}>
        Forward
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.reload(); close(); }}>
        Reload
      </button>
      <div className="menu-sep" />
      {link ? (
        <>
          <button type="button" className="menu-item" onClick={() => { void window.lurkwire.newTab(link); close(); }}>
            Open link in new tab
          </button>
          <button type="button" className="menu-item" onClick={() => { void window.lurkwire.copyText(link); close(); }}>
            Copy link
          </button>
          <div className="menu-sep" />
        </>
      ) : null}
      {isEditable ? (
        <>
          <button type="button" className="menu-item" disabled={!canCut} onClick={() => { void window.lurkwire.pageAction("cut"); close(); }}>
            Cut
          </button>
          <button type="button" className="menu-item" disabled={!canCopy} onClick={() => { void window.lurkwire.pageAction("copy"); close(); }}>
            Copy
          </button>
          <button type="button" className="menu-item" disabled={!canPaste} onClick={() => { void window.lurkwire.pageAction("paste"); close(); }}>
            Paste
          </button>
        </>
      ) : (
        <button
          type="button"
          className="menu-item"
          disabled={!canCopy && !selection}
          onClick={() => {
            if (selection) {
              void window.lurkwire.copyText(selection);
            } else {
              void window.lurkwire.pageAction("copy");
            }
            close();
          }}
        >
          Copy
        </button>
      )}
      <div className="menu-sep" />
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.setTool("history"); close(); }}>
        History
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.openDevTools(); close(); }}>
        Inspect
      </button>
    </>
  );
}

