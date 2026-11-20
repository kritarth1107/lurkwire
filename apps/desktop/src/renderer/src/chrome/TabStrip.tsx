import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import type { AppSnapshot, TabInfo } from "../../../shared/types";
import { projectColor } from "../../../shared/projectColor";
import { openAnchoredPanel, openAtCursor } from "./openPanel";
import { WindowControls } from "./WindowControls";

export function TabStrip({ state }: { state: AppSnapshot }) {
  return (
    <div className={`tabstrip${state.privateMode ? " private" : ""}`}>
      <div
        className="tab-scroll"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) {
            void window.lurkwire.newTab();
          }
        }}
      >
        {state.tabs.map((tab) => (
          <TabButton
            key={tab.id}
            tab={tab}
            selected={tab.id === state.activeTabId}
            color={projectColor(tab.projectId)}
          />
        ))}
      </div>
      <button
        type="button"
        className="new-tab"
        aria-label="New tab"
        title="New tab (Ctrl+T)"
        onClick={() => void window.lurkwire.newTab()}
      >
        <Plus size={16} />
      </button>
      <button
        type="button"
        className="strip-btn"
        aria-label="List all tabs"
        title="List all tabs"
        onClick={(event) =>
          openAnchoredPanel("alltabs", event.currentTarget, { width: 280, height: 360 })
        }
      >
        <ChevronDown size={16} />
      </button>
      <WindowControls />
    </div>
  );
}

function TabButton({
  tab,
  selected,
  color,
}: {
  tab: TabInfo;
  selected: boolean;
  color: string;
}) {
  const [dragging, setDragging] = useState(false);
  const letter = (tab.title || "New Tab").slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      draggable
      className={`tab${selected ? " selected" : ""}${tab.pinned ? " pinned" : ""}${dragging ? " dragging" : ""}`}
      style={{ "--project": color } as React.CSSProperties}
      onClick={() => void window.lurkwire.switchTab(tab.id)}
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
          height: 300,
          payload: { tabId: tab.id, pinned: tab.pinned },
        });
      }}
      title={tab.title}
    >
      {tab.favicon ? (
        <img className="favicon" src={tab.favicon} alt="" />
      ) : (
        <span className="favicon-fallback">{letter}</span>
      )}
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
  );
}
