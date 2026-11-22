import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
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
import { computeAnchoredPosition } from "../../../shared/anchorPopover";
import { popoverMotionStyle } from "../../../shared/popoverMotion";
import { queueToolIntent } from "../workbench/pendingToolIntent";
import { Tooltip } from "./Tooltip";

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
  const assistantOn = state.prefs.llmSidebarOpen;

  return (
    <div className="tools-topbar" role="toolbar" aria-label="Pentest tools">
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
        {TOOL_MENU_GROUPS.map((group, index) => (
          <ToolMenuButton
            key={group.id}
            group={group}
            open={openMenu === group.id}
            onOpen={() => setOpenMenu(group.id)}
            onClose={() => setOpenMenu(null)}
            onOpenAdjacent={(dir) => {
              const next = TOOL_MENU_GROUPS[index + dir];
              if (next) {
                setOpenMenu(next.id);
              }
            }}
            dockOpen={dockOpen}
            panel={panel}
            pinned={pinned}
            onTogglePin={(id) => {
              void window.lurkwire.setPrefs({ pinnedTools: togglePinned(pinned, id) });
            }}
          />
        ))}
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
  );
}

function ToolMenuButton({
  group,
  open,
  onOpen,
  onClose,
  onOpenAdjacent,
  dockOpen,
  panel,
  pinned,
  onTogglePin,
}: {
  group: ToolMenuGroup;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onOpenAdjacent: (dir: -1 | 1) => void;
  dockOpen: boolean;
  panel: SidebarPanel;
  pinned: SidebarPanel[];
  onTogglePin: (id: SidebarPanel) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; align: "start" | "end"; placement: "below" | "above" } | null>(
    null,
  );
  const items = useMemo(() => filterMenuItems(group.items, query), [group.items, query]);
  const groupActive = dockOpen && group.items.some((item) => item.panel === panel && !item.intent);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      setPos(null);
      return;
    }
    const place = () => {
      const node = btnRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      setPos(
        computeAnchoredPosition({
          trigger: rect,
          width: 300,
          height: Math.min(420, 48 + group.items.length * 36),
          viewport: { width: window.innerWidth, height: window.innerHeight },
          align: "start",
          placement: "below",
          gap: 6,
          margin: 8,
        }),
      );
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", place);
    };
  }, [open, group.items.length, onClose]);

  useEffect(() => {
    if (active >= items.length) {
      setActive(0);
    }
  }, [items.length, active]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const id = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);


  const onButtonKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
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

  const onMenuKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      btnRef.current?.focus();
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
    <>
      <button
        ref={btnRef}
        type="button"
        className={`tool-menu-btn${open ? " open" : ""}${groupActive ? " active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${group.label} tools`}
        data-menu={group.id}
        onClick={() => (open ? onClose() : onOpen())}
        onKeyDown={onButtonKey}
      >
        <span>{group.label}</span>
        <ChevronDown size={12} strokeWidth={2.2} />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menuRef}
              className="tool-menu"
              role="menu"
              aria-label={group.label}
              tabIndex={-1}
              style={{ ...popoverMotionStyle(pos), zIndex: "var(--z-dropdown)" } as CSSProperties}
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
                    const isOn = dockOpen && panel === item.panel && (item.intent ? true : !item.intent);
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
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
