import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, ToolId } from "../../../shared/types";
import { PENTEST_TOOLS } from "../../../shared/toolsCatalog";
import { SEND_TO_ACTIONS } from "../../../shared/sendTo";
import { resolveCurrentFlow } from "../flowSelection";
import { dispatchSend } from "../sendActions";
import { shortcutFor } from "../../../shared/shortcuts";

export type PaletteCommand = {
  id: string;
  title: string;
  hint?: string;
  keywords?: string;
  run: () => void;
};

function tools(): PaletteCommand[] {
  const open = (tool: ToolId) => () => {
    void window.lurkwire.setTool(tool);
  };
  const go = (url: string) => () => {
    void window.lurkwire.navigate(url);
  };
  const pages: PaletteCommand[] = [
    { id: "workbench", title: "API Workbench", hint: "lurkwire://workbench", keywords: "postman insomnia api http", run: go("lurkwire://workbench") },
    { id: "newtab", title: "New tab page", hint: "lurkwire://newtab", run: go("lurkwire://newtab") },
    { id: "settings", title: "Settings", hint: "lurkwire://settings", run: go("lurkwire://settings") },
    { id: "downloads", title: "Downloads", hint: "lurkwire://downloads", run: go("lurkwire://downloads") },
    { id: "history-page", title: "Browsing history", hint: "lurkwire://history", run: go("lurkwire://history") },
    { id: "bookmarks", title: "Bookmark manager", hint: "lurkwire://bookmarks", run: go("lurkwire://bookmarks") },
    { id: "extensions", title: "Extensions", hint: "lurkwire://extensions", run: go("lurkwire://extensions") },
    { id: "about", title: "About Lurkwire", hint: "lurkwire://about", run: go("lurkwire://about") },
  ];
  const toolCommands: PaletteCommand[] = [
    ...PENTEST_TOOLS.map((tool) => ({
      id: `tool-${tool.id}`,
      title: tool.label,
      hint: "Top bar",
      keywords: `tool panel ${tool.id} ${tool.keywords}`,
      run: open(tool.id),
    })),
    { id: "tool-ai", title: "AI assistant", hint: "Right sidebar", keywords: "llm chat assistant", run: open("ai") },
  ];
  const actions: PaletteCommand[] = [
    { id: "new-tab", title: "New tab", hint: "Ctrl+T", run: () => void window.lurkwire.newTab() },
    { id: "new-window", title: "New window", hint: "Ctrl+N", run: () => void window.lurkwire.newWindow() },
    { id: "private", title: "New private window", hint: "Ctrl+Shift+N", run: () => void window.lurkwire.newWindow({ privateMode: true }) },
    { id: "devtools", title: "Developer tools", hint: "F12", run: () => void window.lurkwire.openDevTools("detach") },
    { id: "reload", title: "Reload this tab", hint: "F5", run: () => void window.lurkwire.reload() },
    { id: "find", title: "Find in page", hint: "Ctrl+F", run: () => void window.lurkwire.requestFind() },
    { id: "all-tabs", title: "Search tabs", hint: "Ctrl+Shift+A", keywords: "tabs overview manage", run: () => window.dispatchEvent(new CustomEvent("lurkwire:open-all-tabs")) },
    { id: "reader", title: "Reader view", keywords: "article reading mode simplify", run: () => void window.lurkwire.openReaderMode().catch((err: unknown) => window.alert(err instanceof Error ? err.message : String(err))) },
    { id: "downloads-page", title: "Open downloads", hint: "Ctrl+J", run: () => void window.lurkwire.navigate("lurkwire://downloads") },
    { id: "kill", title: "Toggle kill switch", keywords: "emergency stop proxy", run: () => void window.lurkwire.getState().then((state) => window.lurkwire.setKillSwitch(!state.killed)) },
    { id: "toggle-intercept", title: "Toggle intercept", hint: shortcutFor("toggle-intercept"), keywords: "pause intercept traffic", run: () => void toggleIntercept() },
    { id: "shortcuts", title: "Keyboard shortcuts", hint: shortcutFor("shortcuts"), keywords: "hotkeys cheatsheet", run: () => window.dispatchEvent(new CustomEvent("lurkwire:open-shortcuts")) },
    ...SEND_TO_ACTIONS.map((item) => ({
      id: `send-${item.id}`,
      title: item.label,
      hint: item.shortcut,
      keywords: `send-to ${item.id} request`,
      run: () => {
        void window.lurkwire.getState().then(async (state) => {
          const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
          const flow = await resolveCurrentFlow(tab?.url);
          if (!flow) {
            window.alert("No captured request to send. Right-click one in Traffic, or browse a site first.");
            return;
          }
          await dispatchSend(flow, item.id);
        });
      },
    })),
  ];
  return [...pages, ...toolCommands, ...actions];
}

async function toggleIntercept() {
  const current = await window.lurkwire.getIntercept();
  const enabled = !current.config.enabled;
  await window.lurkwire.setIntercept({
    ...current.config,
    enabled,
    requests: true,
    responses: true,
  });
  if (enabled) {
    await window.lurkwire.setTool("intercept");
  }
}

export function CommandPalette({
  open,
  onClose,
  state,
}: {
  open: boolean;
  onClose: () => void;
  state: AppSnapshot;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useMemo(() => tools(), [state.theme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands;
    }
    return commands.filter((item) =>
      `${item.title} ${item.hint ?? ""} ${item.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) {
    return null;
  }

  const run = (command: PaletteCommand) => {
    onClose();
    command.run();
  };

  return (
    <div className="palette-backdrop" data-lw-overlay="" onMouseDown={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={16} strokeWidth={2} aria-hidden="true" />
          <input
          autoFocus
          value={query}
          placeholder="Open a tool, page, or command…"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, Math.max(filtered.length - 1, 0)));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              const item = filtered[active];
              if (item) {
                run(item);
              }
            }
          }}
        />
        </div>
        <div className="palette-list">
          {filtered.length === 0 ? <div className="palette-empty">No matching commands</div> : null}
          {filtered.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`palette-item${index === active ? " active" : ""}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(item)}
            >
              <span>{item.title}</span>
              {item.hint ? <span className="palette-hint">{item.hint}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
