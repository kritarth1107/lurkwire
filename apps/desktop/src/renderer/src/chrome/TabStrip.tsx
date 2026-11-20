import { ChevronDown, Plus } from "lucide-react";
import type { AppSnapshot, TabInfo } from "../../../shared/types";
import { projectColor } from "../../../shared/projectColor";
import { openAnchoredPanel, openAtCursor } from "./openPanel";
import { WindowControls } from "./WindowControls";

export function TabStrip({ state }: { state: AppSnapshot }) {
  return (
    <div className="tabstrip" onDoubleClick={() => void window.lurkwire.windowToggleMaximize()}>
      <div className="tab-scroll">
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
        title="New tab"
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
  const letter = (tab.title || "New Tab").slice(0, 1).toUpperCase();
  return (
    <button
      type="button"
      className={`tab${selected ? " selected" : ""}${tab.pinned ? " pinned" : ""}`}
      style={{ "--project": color } as React.CSSProperties}
      onClick={() => void window.lurkwire.switchTab(tab.id)}
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
