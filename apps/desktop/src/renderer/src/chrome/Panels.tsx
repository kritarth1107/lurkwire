import { useEffect, useRef, useState } from "react";
import { History, Repeat, ShieldOff, Crosshair, KeyRound, Radar, Globe, MessageSquare, FolderTree, GitCompare, ScrollText, Shuffle, Radio } from "lucide-react";
import type {
  AppSnapshot,
  DownloadInfo,
  InterceptState,
  PanelContext,
  PanelKind,
} from "../../../shared/types";
import { TAB_GROUP_COLORS, TAB_GROUP_COLOR_HEX, groupLabel } from "../../../shared/tabGroups";
import { projectColor } from "../../../shared/projectColor";
import { useAppState } from "../useAppState";
import type { SiteInfo } from "../../../shared/siteInfo";

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
      {kind === "tabmenu" ? <TabMenu payload={ctx?.payload ?? {}} state={state} /> : null}
      {kind === "pagemenu" ? <PageMenu payload={ctx?.payload ?? {}} /> : null}
      {kind === "groupmenu" ? <GroupMenu payload={ctx?.payload ?? {}} state={state} /> : null}
      {!kind ? <div className="placeholder">Loading…</div> : null}
    </div>
  );
}

function close(): void {
  void window.lurkwire.closePanel();
}

function AppMenu({ state }: { state: AppSnapshot }) {
  const [sub, setSub] = useState<
    "history" | "bookmarks" | "tabgroups" | "extensions" | "find" | "save" | "more" | "profile" | null
  >(null);
  const zoom = Math.round((state.zoomFactor || 1) * 100);

  if (sub === "history") {
    return (
      <SubMenu title="History" onBack={() => setSub(null)}>
        <MenuItem label="History" shortcut="Ctrl+H" onClick={() => go("lurkwire://history")} />
        <MenuItem label="Downloads" shortcut="Ctrl+J" onClick={() => go("lurkwire://downloads")} />
        <div className="menu-sep" />
        <RecentVisits />
      </SubMenu>
    );
  }
  if (sub === "bookmarks") {
    return (
      <SubMenu title="Bookmarks and lists" onBack={() => setSub(null)}>
        <MenuItem
          label="Bookmark this tab"
          shortcut="Ctrl+D"
          onClick={() => {
            const tab = state.tabs.find((item) => item.id === state.activeTabId);
            if (tab?.url) {
              void window.lurkwire.addBookmark({ title: tab.title || tab.url, url: tab.url });
            }
            close();
          }}
        />
        <MenuItem
          label={state.prefs.bookmarksBar ? "Hide bookmarks toolbar" : "Show bookmarks toolbar"}
          shortcut="Ctrl+Shift+B"
          onClick={() => {
            void window.lurkwire.setPrefs({ bookmarksBar: !state.prefs.bookmarksBar });
            close();
          }}
        />
        <MenuItem label="Bookmark manager" shortcut="Ctrl+Shift+O" onClick={() => go("lurkwire://bookmarks")} />
      </SubMenu>
    );
  }
  if (sub === "tabgroups") {
    const active = state.tabs.find((item) => item.id === state.activeTabId);
    return (
      <SubMenu title="Tab groups" onBack={() => setSub(null)}>
        <MenuItem
          label="Add current tab to a new group"
          disabled={!active || active.pinned}
          onClick={() => {
            if (active) {
              void window.lurkwire.createTabGroup(active.id);
            }
            close();
          }}
        />
        {state.tabGroups.length === 0 ? (
          <p className="menu-note">No groups yet. Right-click a tab to add it to a group.</p>
        ) : null}
        {state.tabGroups.map((group) => (
          <MenuItem
            key={group.id}
            label={`${groupLabel(group)} (${group.collapsed ? "collapsed" : "open"})`}
            onClick={() => {
              void window.lurkwire.updateTabGroup(group.id, { collapsed: !group.collapsed });
              close();
            }}
          />
        ))}
      </SubMenu>
    );
  }
  if (sub === "extensions") {
    return (
      <SubMenu title="Extensions" onBack={() => setSub(null)}>
        <MenuItem label="Manage extensions" onClick={() => go("lurkwire://extensions")} />
      </SubMenu>
    );
  }
  if (sub === "find") {
    return (
      <SubMenu title="Find and edit" onBack={() => setSub(null)}>
        <MenuItem
          label="Find"
          shortcut="Ctrl+F"
          onClick={() => {
            void window.lurkwire.requestFind();
            close();
          }}
        />
        <MenuItem
          label="Find next"
          shortcut="F3"
          onClick={() => {
            void window.lurkwire.requestFind();
            close();
          }}
        />
      </SubMenu>
    );
  }
  if (sub === "save") {
    return (
      <SubMenu title="Save and share" onBack={() => setSub(null)}>
        <MenuItem
          label="Save page as…"
          shortcut="Ctrl+S"
          onClick={() => {
            void window.lurkwire.command("save");
            close();
          }}
        />
        <MenuItem
          label="Copy URL"
          onClick={() => {
            const tab = state.tabs.find((item) => item.id === state.activeTabId);
            if (tab?.url) {
              void window.lurkwire.copyText(tab.url);
            }
            close();
          }}
        />
      </SubMenu>
    );
  }
  if (sub === "more") {
    return (
      <SubMenu title="More tools" onBack={() => setSub(null)}>
        <MenuItem
          label="Developer tools"
          shortcut="Ctrl+Shift+I"
          onClick={() => {
            void window.lurkwire.openDevTools("detach");
            close();
          }}
        />
        <MenuItem
          label="Dock Developer tools to bottom"
          onClick={() => {
            void window.lurkwire.openDevTools("bottom");
            close();
          }}
        />
        <MenuItem
          label="Dock Developer tools to right"
          onClick={() => {
            void window.lurkwire.openDevTools("right");
            close();
          }}
        />
        <MenuItem
          label="Task manager"
          onClick={() => {
            void window.lurkwire.openDevTools("detach");
            close();
          }}
        />
        <MenuItem
          label="Lurkwire tools"
          onClick={() => {
            void window.lurkwire.setPrefs({ sidebarOpen: true, sidebarPanel: "history" });
            close();
          }}
        />
        <MenuItem label="Site map" onClick={() => { void window.lurkwire.setTool("sitemap"); close(); }} />
        <MenuItem label="API Workbench" shortcut="Ctrl+Shift+M" onClick={() => go("lurkwire://workbench")} />
        <MenuItem label="Comparer" onClick={() => { void window.lurkwire.setTool("comparer"); close(); }} />
        <MenuItem label="Sequencer" onClick={() => { void window.lurkwire.setTool("sequencer"); close(); }} />
        <MenuItem label="Logger" onClick={() => { void window.lurkwire.setTool("logger"); close(); }} />
        <MenuItem label="OOB collaborator" onClick={() => { void window.lurkwire.setTool("oob"); close(); }} />
        <MenuItem
          label="View source"
          shortcut="Ctrl+U"
          onClick={() => {
            void window.lurkwire.command("viewSource");
            close();
          }}
        />
      </SubMenu>
    );
  }
  if (sub === "profile") {
    const project = state.projects.find((item) => item.id === state.currentProjectId);
    return (
      <SubMenu title="Profile" onBack={() => setSub(null)}>
        <p className="menu-note">
          This window uses the {project?.name ?? "default"} project
          {state.privateMode ? " in a private session. Cookies and history are not saved." : "."}
        </p>
        <MenuItem label="Project settings" onClick={() => go("lurkwire://settings")} />
      </SubMenu>
    );
  }

  return (
    <div className="appmenu">
      <MenuItem label="New tab" shortcut="Ctrl+T" onClick={() => { void window.lurkwire.newTab(); close(); }} />
      <MenuItem label="New window" shortcut="Ctrl+N" onClick={() => { void window.lurkwire.newWindow(); close(); }} />
      <MenuItem
        label="New private window"
        shortcut="Ctrl+Shift+N"
        onClick={() => {
          void window.lurkwire.newWindow({ privateMode: true });
          close();
        }}
      />
      <div className="menu-sep" />
      <MenuItem label="Profile" submenu onClick={() => setSub("profile")} />
      <MenuItem label="Passwords and autofill" onClick={() => go("lurkwire://settings")} />
      <MenuItem label="History" shortcut="Ctrl+H" submenu onClick={() => setSub("history")} />
      <MenuItem label="Downloads" shortcut="Ctrl+J" onClick={() => go("lurkwire://downloads")} />
      <MenuItem label="Workbench" shortcut="Ctrl+Shift+M" onClick={() => go("lurkwire://workbench")} />
      <MenuItem label="Bookmarks and lists" submenu onClick={() => setSub("bookmarks")} />
      <MenuItem label="Tab groups" submenu onClick={() => setSub("tabgroups")} />
      <MenuItem label="Extensions" submenu onClick={() => setSub("extensions")} />
      <MenuItem
        label="Delete browsing data"
        shortcut="Ctrl+Shift+Del"
        onClick={() => {
          void window.lurkwire.command("clearData");
          close();
        }}
      />
      <div className="menu-sep" />
      <div className="zoom-row">
        <span className="zoom-label">Zoom</span>
        <button type="button" aria-label="Zoom out" onClick={() => void window.lurkwire.adjustZoom(-0.1)}>
          −
        </button>
        <span className="zoom-value">{zoom}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => void window.lurkwire.adjustZoom(0.1)}>
          +
        </button>
        <button
          type="button"
          aria-label="Fullscreen"
          title="Fullscreen (F11)"
          onClick={() => {
            void window.lurkwire.command("fullscreen");
            close();
          }}
        >
          ⛶
        </button>
      </div>
      <div className="menu-sep" />
      <MenuItem
        label="Print…"
        shortcut="Ctrl+P"
        onClick={() => {
          void window.lurkwire.command("print");
          close();
        }}
      />
      <MenuItem label="Find and edit" submenu onClick={() => setSub("find")} />
      <MenuItem label="Save and share" submenu onClick={() => setSub("save")} />
      <MenuItem label="More tools" submenu onClick={() => setSub("more")} />
      <div className="menu-sep" />
      <MenuItem label="Help" onClick={() => go("lurkwire://about")} />
      <MenuItem label="Settings" shortcut="Ctrl+," onClick={() => go("lurkwire://settings")} />
      <MenuItem
        label="Exit"
        shortcut="Ctrl+Q"
        onClick={() => {
          void window.lurkwire.command("quit");
        }}
      />
    </div>
  );
}

function go(url: string): void {
  void window.lurkwire.navigate(url);
  close();
}

function MenuItem({
  label,
  shortcut,
  submenu,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  submenu?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="menu-item" disabled={disabled} onClick={onClick}>
      <span className="menu-label-text">{label}</span>
      {shortcut ? <kbd>{shortcut}</kbd> : null}
      {submenu ? <span className="menu-caret">›</span> : null}
    </button>
  );
}

function SubMenu({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="appmenu">
      <button type="button" className="menu-item submenu-back" onClick={onBack}>
        ‹ {title}
      </button>
      <div className="menu-sep" />
      {children}
    </div>
  );
}

function RecentVisits() {
  const [items, setItems] = useState<{ id: string; title: string; url: string }[]>([]);
  useEffect(() => {
    void window.lurkwire.listVisits().then((list) => setItems(list.slice(0, 6)));
  }, []);
  if (items.length === 0) {
    return <p className="menu-note">No recent pages.</p>;
  }
  return (
    <>
      {items.map((item) => (
        <MenuItem key={item.id} label={item.title || item.url} onClick={() => go(item.url)} />
      ))}
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
  const secureHint = Boolean(payload.secure);
  const [info, setInfo] = useState<SiteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.lurkwire
      .getSiteInfo(url)
      .then((next) => {
        if (!cancelled) {
          setInfo(next);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const secure = info?.secure ?? secureHint;
  const internal = info?.internal || url.startsWith("lurkwire://") || url.startsWith("about:");
  const cert = info?.certificate;
  return (
    <div className="identity-card">
      <h3>
        {internal
          ? "Lurkwire page"
          : secure
            ? "Connection is secure"
            : url
              ? "Connection is not secure"
              : "New Tab"}
      </h3>
      <p className="mono wrap">{url || "This is a built-in Lurkwire page."}</p>
      {internal ? (
        <p>Built-in pages stay inside the app and are not sent through the intercepting proxy.</p>
      ) : (
        <p>HTTPS is intercepted with a per-install CA trusted only inside this app. Certificate details below are from the real upstream server.</p>
      )}
      {error ? <p className="error">{error}</p> : null}

      {!internal && cert ? (
        <section>
          <h4>Certificate</h4>
          <p><strong>TLS</strong> {cert.protocol ?? "unknown"}{cert.authorized ? "" : " · not trusted by the system store"}</p>
          <p><strong>Subject</strong> {cert.subject || "—"}</p>
          <p><strong>Issuer</strong> {cert.issuer || "—"}</p>
          <p><strong>Valid</strong> {cert.validFrom} – {cert.validTo}</p>
          {cert.sans.length ? <p><strong>SANs</strong> {cert.sans.slice(0, 8).join(", ")}{cert.sans.length > 8 ? ` +${cert.sans.length - 8}` : ""}</p> : null}
          {cert.fingerprint ? <p className="mono wrap">{cert.fingerprint}</p> : null}
        </section>
      ) : null}
      {!internal && info?.certError ? <p className="error">{info.certError}</p> : null}

      {!internal ? (
        <section>
          <h4>Permissions</h4>
          {info?.permissions.length ? (
            <ul>
              {info.permissions.map((item) => (
                <li key={`${item.permission}-${item.at}`}>
                  {item.permission} · {item.state}
                </li>
              ))}
            </ul>
          ) : (
            <p>No site permissions have been requested in this profile yet.</p>
          )}
        </section>
      ) : null}

      {!internal ? (
        <section>
          <h4>Cookies</h4>
          {info?.cookies.length ? (
            <ul>
              {info.cookies.slice(0, 12).map((cookie) => (
                <li key={`${cookie.domain}-${cookie.name}`}>
                  <span className="mono">{cookie.name}</span>
                  {cookie.secure ? " · Secure" : ""}
                  {cookie.httpOnly ? " · HttpOnly" : ""}
                  {cookie.sameSite && cookie.sameSite !== "unspecified" ? ` · ${cookie.sameSite}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p>No cookies for this origin in the current project session.</p>
          )}
        </section>
      ) : null}

      {!internal ? (
        <section>
          <h4>Site intel</h4>
          {info?.intel.ips.length ? <p><strong>IP</strong> {info.intel.ips.join(", ")}</p> : <p>No DNS records from the system resolver yet.</p>}
          {info?.intel.lastStatus != null ? <p><strong>Last status</strong> {info.intel.lastStatus} · {info.intel.flowCount} captured flow(s)</p> : null}
          {info?.intel.tech.length ? <p><strong>Tech</strong> {info.intel.tech.join(" · ")}</p> : null}
          {info?.intel.headerSummary.length ? (
            <ul>
              {info.intel.headerSummary.map((header) => (
                <li key={header.name}>
                  <strong>{header.name}</strong> {header.value}
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              void window.lurkwire.setTool("recon");
              close();
            }}
          >
            Open in Recon
          </button>
        </section>
      ) : null}
      {state.proxy.fingerprint ? (
        <p className="meta">Install CA {state.proxy.fingerprint.slice(0, 16)}…</p>
      ) : null}
    </div>
  );
}

function LurkwireMenu() {
  const tools = [
    { id: "history", label: "History", icon: History },
    { id: "sitemap", label: "Site map", icon: FolderTree },
    { id: "intercept", label: "Intercept", icon: ShieldOff },
    { id: "repeater", label: "Repeater", icon: Repeat },
    { id: "intruder", label: "Intruder", icon: Crosshair },
    { id: "decode", label: "Decode", icon: KeyRound },
    { id: "sequencer", label: "Sequencer", icon: Shuffle },
    { id: "comparer", label: "Comparer", icon: GitCompare },
    { id: "logger", label: "Logger", icon: ScrollText },
    { id: "scanner", label: "Scanner", icon: Radar },
    { id: "recon", label: "Recon", icon: Globe },
    { id: "oob", label: "OOB", icon: Radio },
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

function TabMenu({ payload, state }: { payload: Record<string, unknown>; state: AppSnapshot }) {
  const id = String(payload.tabId ?? "");
  const pinned = Boolean(payload.pinned);
  const groupId = typeof payload.groupId === "string" ? payload.groupId : null;
  const groups = state.tabGroups ?? [];
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
      {pinned ? null : (
        <>
          <button type="button" className="menu-item" onClick={() => { void window.lurkwire.createTabGroup(id); close(); }}>
            Add tab to new group
          </button>
          {groups.filter((group) => group.id !== groupId).map((group) => (
            <button
              key={group.id}
              type="button"
              className="menu-item"
              onClick={() => { void window.lurkwire.addTabToGroup(id, group.id); close(); }}
            >
              Add to {groupLabel(group)}
            </button>
          ))}
          {groupId ? (
            <button type="button" className="menu-item" onClick={() => { void window.lurkwire.ungroupTab(id); close(); }}>
              Remove from group
            </button>
          ) : null}
          <div className="menu-sep" />
        </>
      )}
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

function GroupMenu({ payload, state }: { payload: Record<string, unknown>; state: AppSnapshot }) {
  const id = String(payload.groupId ?? "");
  const group = (state.tabGroups ?? []).find((item) => item.id === id);
  const [title, setTitle] = useState(group?.title ?? "");
  if (!group) {
    return <div className="placeholder">This group is gone.</div>;
  }
  return (
    <div className="group-menu">
      <input
        className="menu-input"
        value={title}
        placeholder="Name this group"
        autoFocus
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void window.lurkwire.updateTabGroup(id, { title })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void window.lurkwire.updateTabGroup(id, { title });
            close();
          }
        }}
      />
      <div className="group-colors">
        {TAB_GROUP_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`group-color${group.color === color ? " selected" : ""}`}
            style={{ background: TAB_GROUP_COLOR_HEX[color] }}
            title={color}
            aria-label={color}
            onClick={() => void window.lurkwire.updateTabGroup(id, { color })}
          />
        ))}
      </div>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.updateTabGroup(id, { collapsed: !group.collapsed }); close(); }}>
        {group.collapsed ? "Expand group" : "Collapse group"}
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.newTabInGroup(id); close(); }}>
        New tab in group
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.ungroupTabGroup(id); close(); }}>
        Ungroup
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.closeTabGroup(id); close(); }}>
        Close group
      </button>
    </div>
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
      <button
        type="button"
        className="menu-item"
        onClick={() => {
          const x = Number(payload.inspectX ?? 0);
          const y = Number(payload.inspectY ?? 0);
          void window.lurkwire.inspectElement(x, y);
          close();
        }}
      >
        Inspect
      </button>
      <button type="button" className="menu-item" onClick={() => { void window.lurkwire.openDevTools("detach"); close(); }}>
        Developer tools <kbd>Ctrl+Shift+I</kbd>
      </button>
    </>
  );
}

