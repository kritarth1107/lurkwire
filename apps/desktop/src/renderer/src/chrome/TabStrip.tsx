import { AlertTriangle, ChevronDown, Globe, Plus, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { AppSnapshot, TabGroup, TabInfo } from "../../../shared/types";
import { TAB_GROUP_COLOR_HEX, groupLabel, tabStripSegments } from "../../../shared/tabGroups";
import { projectColor } from "../../../shared/projectColor";
import { openAnchoredPanel, openAtCursor } from "./openPanel";
import { WindowControls } from "./WindowControls";
import { Tooltip, formatMemory } from "./Tooltip";
import { BrandMark } from "../Brand";

export function TabStrip({ state }: { state: AppSnapshot }) {
  const segments = tabStripSegments(state.tabs, state.tabGroups ?? []);
  return (
    <div className={`tabstrip${state.privateMode ? " private" : ""}`}>
      <button
        type="button"
        className="strip-brand no-drag"
        title="Lurkwire"
        aria-label="Open a new Lurkwire tab"
        onClick={() => void window.lurkwire.newTab("lurkwire://newtab")}
      >
        <BrandMark className="strip-logo" />
      </button>
      <div
        className="tab-scroll"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            void window.lurkwire.newTab();
          }
        }}
      >
        {segments.map((segment, index) =>
          segment.kind === "group" ? (
            <TabGroupBlock
              key={segment.group.id}
              group={segment.group}
              tabs={segment.tabs}
              state={state}
            />
          ) : (
            <div key={`tabs-${index}`} className="tab-cluster">
              {segment.tabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  tab={tab}
                  selected={tab.id === state.activeTabId}
                  color={projectColor(tab.projectId)}
                />
              ))}
            </div>
          ),
        )}
      </div>
      <Tooltip label="New tab" shortcut="Ctrl+T">
        <button
          type="button"
          className="new-tab"
          aria-label="New tab"
          onClick={() => void window.lurkwire.newTab()}
        >
          <Plus size={16} />
        </button>
      </Tooltip>
      <Tooltip label="List all tabs">
        <button
          type="button"
          className="strip-btn"
          aria-label="List all tabs"
          onClick={(event) =>
            openAnchoredPanel("alltabs", event.currentTarget, { width: 420, height: 440 })
          }
        >
          <ChevronDown size={16} />
        </button>
      </Tooltip>
      <WindowControls />
    </div>
  );
}

function TabGroupBlock({
  group,
  tabs,
  state,
}: {
  group: TabGroup;
  tabs: TabInfo[];
  state: AppSnapshot;
}) {
  const accent = TAB_GROUP_COLOR_HEX[group.color];
  const hasActive = tabs.some((tab) => tab.id === state.activeTabId);
  return (
    <div
      className={`tab-group${group.collapsed ? " collapsed" : ""}${hasActive ? " has-active" : ""}`}
      style={{ "--group": accent } as React.CSSProperties}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/lurkwire-tab")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/lurkwire-tab");
        const anchor = tabs[0];
        if (id && anchor) {
          void window.lurkwire.moveTab(id, anchor.id);
        }
      }}
    >
      <button
        type="button"
        className="tab-group-chip"
        title={group.collapsed ? "Expand group" : "Collapse group"}
        onClick={() => void window.lurkwire.updateTabGroup(group.id, { collapsed: !group.collapsed })}
        onContextMenu={(event) => {
          event.preventDefault();
          openAtCursor("groupmenu", event, {
            width: 260,
            height: 280,
            payload: { groupId: group.id },
          });
        }}
      >
        {groupLabel(group)}
        <span className="tab-group-count">{tabs.length}</span>
      </button>
      {group.collapsed
        ? null
        : tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              selected={tab.id === state.activeTabId}
              color={projectColor(tab.projectId)}
              groupColor={accent}
            />
          ))}
    </div>
  );
}

function TabButton({
  tab,
  selected,
  color,
  groupColor,
}: {
  tab: TabInfo;
  selected: boolean;
  color: string;
  groupColor?: string;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <TabTip tab={tab}>
    <button
      type="button"
      draggable
      className={`tab${selected ? " selected" : ""}${tab.pinned ? " pinned" : ""}${dragging ? " dragging" : ""}${tab.groupId ? " grouped" : ""}`}
      style={{ "--project": color, "--group": groupColor ?? "transparent" } as React.CSSProperties}
      onClick={() => {
        if (tab.crashed || tab.failed) {
          void window.lurkwire.reloadTab(tab.id);
        }
        void window.lurkwire.switchTab(tab.id);
      }}
      onAuxClick={(event) => {
        if (event.button === 1 && !tab.pinned) {
          event.preventDefault();
          void window.lurkwire.closeTab(tab.id);
        }
      }}
      onDragStart={(event) => {
        setDragging(true);
        event.dataTransfer.setData("text/lurkwire-tab", tab.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("text/lurkwire-tab")) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const id = event.dataTransfer.getData("text/lurkwire-tab");
        if (id && id !== tab.id) {
          void window.lurkwire.moveTab(id, tab.id);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openAtCursor("tabmenu", event, {
          width: 230,
          height: 420,
          payload: { tabId: tab.id, pinned: tab.pinned, groupId: tab.groupId },
        });
      }}
    >
      <TabGlyph tab={tab} />
      <span className="tab-title">{tab.title || "New Tab"}</span>
      {tab.pinned ? null : (
        <span
          className="tab-close"
          role="button"
          aria-label="Close tab"
          onClick={(event) => {
            event.stopPropagation();
            void window.lurkwire.closeTab(tab.id);
          }}
        >
          ×
        </span>
      )}
      <span className="tab-container-line" />
    </button>
    </TabTip>
  );
}

function TabTip({ tab, children }: { tab: TabInfo; children: ReactNode }) {
  const [memory, setMemory] = useState("");
  useEffect(() => {
    let cancelled = false;
    void window.lurkwire.getTabMemory(tab.id).then((info) => {
      if (!cancelled) {
        setMemory(formatMemory(info.bytes));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tab.id, tab.url]);
  const extra = [tab.url && tab.url !== "lurkwire://newtab" ? tab.url : "", memory ? `Memory · ${memory}` : ""]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <Tooltip label={tab.title || "New Tab"} extra={extra || undefined}>
      {children}
    </Tooltip>
  );
}


function TabGlyph({ tab }: { tab: TabInfo }) {
  const showSpinner = tab.loading && !tab.crashed;
  return (
    <span className={`tab-glyph${tab.crashed || tab.failed ? " is-error" : ""}`}>
      {showSpinner ? (
        <span className="tab-throbber" role="progressbar" aria-label="Loading" />
      ) : tab.crashed || tab.failed ? (
        <AlertTriangle size={14} className="tab-status-icon" aria-label={tab.crashed ? "Tab crashed" : "Failed to load"} />
      ) : tab.favicon ? (
        <img className="favicon" src={tab.favicon} alt="" />
      ) : (
        <Globe size={14} className="tab-globe" aria-hidden />
      )}
      {tab.muted || tab.audible ? (
        <button
          type="button"
          className={`tab-audio${tab.muted ? " muted" : ""}`}
          title={tab.muted ? "Unmute tab" : "Mute tab"}
          aria-label={tab.muted ? "Unmute tab" : "Mute tab"}
          onClick={(event) => {
            event.stopPropagation();
            void window.lurkwire.setTabMuted(tab.id, !tab.muted);
          }}
        >
          {tab.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </button>
      ) : null}
    </span>
  );
}
