import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { computeAnchoredPosition, type ClientRect } from "../../../shared/anchorPopover";
import {
  Cookie,
  Crosshair,
  FolderTree,
  GitCompare,
  Globe,
  KeyRound,
  Radio,
  Repeat,
  ScrollText,
  Search,
  Share2,
  ShieldAlert,
  ShieldOff,
  Shuffle,
  StickyNote,
  Radar,
  Activity,
  Wrench,
  Filter,
  Replace,
  ScanSearch,
  Split,
  FileOutput,
  Waypoints,
  Shield,
  ChevronDown,
  Pin,
  PinOff,
  Sparkles,
} from "lucide-react";
import type { AppSnapshot, SidebarPanel } from "../../../shared/types";
import { pentestTool } from "../../../shared/toolsCatalog";
import {
  DEFAULT_PINNED_TOOLS,
  TOOL_MENU_GROUPS,
  filterMenuItems,
  sanitizePinnedTools,
  togglePinned,
  type ToolMenuGroup,
  type ToolMenuItem,
} from "../../../shared/toolMenus";
import { queueToolIntent } from "../workbench/pendingToolIntent";
import { Tooltip } from "./Tooltip";
import { notifyOverlaysChanged } from "./overlayLayer";

export const TOOL_ICONS: Record<SidebarPanel, typeof Activity> = {
  history: Activity,
  intercept: ShieldOff,
  repeater: Repeat,
  intruder: Crosshair,
  scanner: Radar,
  decode: KeyRound,
  cookies: Cookie,
  sitemap: FolderTree,
  comparer: GitCompare,
  logger: ScrollText,
  sequencer: Shuffle,
  recon: Globe,
  oob: Radio,
  autorize: ShieldAlert,
  discover: Search,
  graphql: Share2,
  notes: StickyNote,
  ai: Wrench,
  scope: Filter,
  matchreplace: Replace,
  paramminer: ScanSearch,
  smuggling: Split,
  report: FileOutput,
  websocket: Waypoints,
  cors: Shield,
};

function openTool(item: ToolMenuItem, alreadyActive: boolean) {
  if (alreadyActive && !item.intent) {
    void window.lurkwire.setPrefs({ sidebarOpen: false });
    return;
  }
  queueToolIntent(item.intent);
  void window.lurkwire.setTool(item.panel);
}

export function ToolsTopBar({ state }: { state: AppSnapshot }) {
  const dockOpen = state.prefs.sidebarOpen;
  const panel = state.prefs.sidebarPanel;
  const pinned = sanitizePinnedTools(state.prefs.pinnedTools ?? DEFAULT_PINNED_TOOLS);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<ClientRect | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const assistantOn = state.prefs.llmSidebarOpen;
  const openGroup = TOOL_MENU_GROUPS.find((group) => group.id === openMenu) ?? null;

  function openGroupAt(id: string, button: HTMLElement) {
    const rect = button.getBoundingClientRect();
    setMenuAnchor({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    setOpenMenu(id);
  }

  function closeMenu() {
    setOpenMenu(null);
    setMenuAnchor(null);
  }

  return (
    <div className="tools-cluster">
      <div className="tools-topbar" ref={barRef} role="toolbar" aria-label="Pentest tools">
        <div className="tools-pins">
          {pinned.map((id) => {
            const tool = pentestTool(id);
            if (!tool) {
              return null;
            }
            const Icon = TOOL_ICONS[id] ?? Wrench;
            const active = dockOpen && panel === id;
            return (
              <Tooltip key={id} label={tool.label} extra={tool.hint}>
                <button
                  type="button"
                  className={`tool-chip pin${active ? " active" : ""}`}
                  aria-label={tool.label}
                  aria-pressed={active}
                  data-tool={id}
                  onClick={() => {
                    if (active) {
                      void window.lurkwire.setPrefs({ sidebarOpen: false });
                      return;
                    }
                    void window.lurkwire.setTool(id);
                  }}
                >
                  <Icon size={14} strokeWidth={2} />
                  <span>{tool.shortName}</span>
                </button>
              </Tooltip>
            );
          })}
        </div>
        <div className="tools-menus">
          {TOOL_MENU_GROUPS.map((group, index) => {
            const groupActive = dockOpen && group.items.some((item) => item.panel === panel && !item.intent);
            return (
              <ToolMenuButton
                key={group.id}
                group={group}
                open={openMenu === group.id}
                groupActive={groupActive}
                onOpen={(button) => openGroupAt(group.id, button)}
                onClose={closeMenu}
                onOpenAdjacent={(dir) => {
                  const next = TOOL_MENU_GROUPS[index + dir];
                  if (next) {
                    const node = barRef.current?.querySelector<HTMLButtonElement>(`button[data-menu="${next.id}"]`);
                    if (node) {
                      openGroupAt(next.id, node);
                    } else {
                      setOpenMenu(next.id);
                    }
                  }
                }}
              />
            );
          })}
        </div>
        <div className="tools-aux">
          <Tooltip label="Assistant" extra="Toggle the right-hand LLM sidebar">
            <button
              type="button"
              className={`tool-chip aux${assistantOn ? " active" : ""}`}
              aria-pressed={assistantOn}
              aria-label="Assistant"
              data-tool="ai"
              onClick={() => {
                if (assistantOn) {
                  void window.lurkwire.setPrefs({ llmSidebarOpen: false });
                  return;
                }
                void window.lurkwire.setTool("ai");
              }}
            >
              <Sparkles size={14} strokeWidth={2} />
              <span>Assistant</span>
            </button>
          </Tooltip>
          <Tooltip label="API workbench" extra="gRPC, GraphQL, and HTTP collections">
            <button
              type="button"
              className="tool-chip aux"
              aria-label="API workbench"
              onClick={() => void window.lurkwire.navigate("lurkwire://workbench")}
            >
              <Wrench size={14} strokeWidth={2} />
              <span>Workbench</span>
            </button>
          </Tooltip>
        </div>
      </div>
      {openGroup && menuAnchor
        ? createPortal(
            <ToolMenuPanel
              group={openGroup}
              anchor={menuAnchor}
              dockOpen={dockOpen}
              panel={panel}
              pinned={pinned}
              onTogglePin={(id) => {
                void window.lurkwire.setPrefs({ pinnedTools: togglePinned(pinned, id) });
              }}
              onClose={closeMenu}
              onOpenAdjacent={(dir) => {
                const index = TOOL_MENU_GROUPS.findIndex((item) => item.id === openGroup.id);
                const next = TOOL_MENU_GROUPS[index + dir];
                if (!next) {
                  return;
                }
                const node = barRef.current?.querySelector<HTMLButtonElement>(`button[data-menu="${next.id}"]`);
                if (node) {
                  openGroupAt(next.id, node);
                }
              }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

function ToolMenuButton({
  group,
  open,
  groupActive,
  onOpen,
  onClose,
  onOpenAdjacent,
}: {
  group: ToolMenuGroup;
  open: boolean;
  groupActive: boolean;
  onOpen: (button: HTMLElement) => void;
  onClose: () => void;
  onOpenAdjacent: (dir: -1 | 1) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const onButtonKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (btnRef.current) {
        onOpen(btnRef.current);
      }
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onOpenAdjacent(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onOpenAdjacent(-1);
    }
    if (event.key === "Escape") {
      onClose();
    }
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={`tool-menu-btn${open ? " open" : ""}${groupActive ? " active" : ""}`}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`${group.label} tools`}
      data-menu={group.id}
      onClick={(event) => (open ? onClose() : onOpen(event.currentTarget))}
      onKeyDown={onButtonKey}
    >
      <span>{group.label}</span>
      <ChevronDown size={12} strokeWidth={2.2} />
    </button>
  );
}

function ToolMenuPanel({
  group,
  anchor,
  dockOpen,
  panel,
  pinned,
  onTogglePin,
  onClose,
  onOpenAdjacent,
}: {
  group: ToolMenuGroup;
  anchor: ClientRect;
  dockOpen: boolean;
  panel: SidebarPanel;
  pinned: SidebarPanel[];
  onTogglePin: (id: SidebarPanel) => void;
  onClose: () => void;
  onOpenAdjacent: (dir: -1 | 1) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ top: Math.round(anchor.bottom + 4), left: Math.round(anchor.left) });
  const items = useMemo(() => filterMenuItems(group.items, query), [group.items, query]);

  useLayoutEffect(() => {
    const node = menuRef.current;
    if (!node) {
      return;
    }
    const box = node.getBoundingClientRect();
    const next = computeAnchoredPosition({
      trigger: anchor,
      width: Math.max(box.width, 280),
      height: Math.max(box.height, 120),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align: "start",
      placement: "below",
      gap: 4,
      margin: 8,
    });
    setPos({ top: next.top, left: next.left });
    notifyOverlaysChanged();
  }, [anchor, group.id, query, items.length]);

  useEffect(() => {
    setQuery("");
    setActive(0);
  }, [group.id]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current?.contains(target)) {
        return;
      }
      if (target instanceof Element && target.closest("button[data-menu]")) {
        return;
      }
      onClose();
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [onClose]);

  useEffect(() => {
    if (active >= items.length) {
      setActive(0);
    }
  }, [items.length, active]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [group.id]);

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(1, items.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + Math.max(1, items.length)) % Math.max(1, items.length));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, items.length - 1));
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onOpenAdjacent(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onOpenAdjacent(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = items[active];
      if (item) {
        openTool(item, dockOpen && panel === item.panel);
        onClose();
      }
    }
  };

  return (
    <div
      ref={menuRef}
      className="tool-menu"
      data-lw-overlay=""
      role="menu"
      aria-label={group.label}
      tabIndex={-1}
      style={{ top: pos.top, left: pos.left }}
      onKeyDown={onMenuKey}
    >
      <div className="tool-menu-search">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          placeholder={`Search ${group.label}…`}
          aria-label={`Search ${group.label} tools`}
          spellCheck={false}
        />
      </div>
      <div className="tool-menu-list">
        {items.length ? (
          items.map((item, index) => {
            const Icon = TOOL_ICONS[item.panel] ?? Wrench;
            const isOn = dockOpen && panel === item.panel;
            const isPinned = pinned.includes(item.panel);
            return (
              <div
                key={item.id}
                className={`tool-menu-row${index === active ? " active" : ""}${isOn ? " current" : ""}`}
                role="menuitem"
                tabIndex={-1}
                onMouseEnter={() => setActive(index)}
                onClick={() => {
                  openTool(item, dockOpen && panel === item.panel && !item.intent);
                  onClose();
                }}
              >
                <Icon size={16} strokeWidth={1.9} />
                <span className="tool-menu-copy">
                  <span className="tool-menu-name">{item.label}</span>
                  <span className="tool-menu-hint">{item.hint}</span>
                </span>
                {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
                <button
                  type="button"
                  className="tool-menu-pin"
                  aria-label={isPinned ? `Unpin ${item.shortName}` : `Pin ${item.shortName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin(item.panel);
                  }}
                >
                  {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                </button>
              </div>
            );
          })
        ) : (
          <div className="tool-menu-empty">No matching tools. Try Ctrl+K to search everything.</div>
        )}
      </div>
    </div>
  );
}
