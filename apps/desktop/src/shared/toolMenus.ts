import type { SidebarPanel } from "./types";
import { PENTEST_TOOLS, type PentestToolDef } from "./toolsCatalog";
import { shortcutFor } from "./shortcuts";

export type ToolMenuGroupId = "proxy" | "attack" | "recon" | "decode" | "report";

export type ToolIntent = "jwt" | "cvss";

export type ToolMenuItem = {
  id: string;
  label: string;
  shortName: string;
  hint: string;
  panel: SidebarPanel;
  shortcut?: string;
  intent?: ToolIntent;
  keywords: string;
};

export type ToolMenuGroup = {
  id: ToolMenuGroupId;
  label: string;
  items: ToolMenuItem[];
};

export const DEFAULT_PINNED_TOOLS: SidebarPanel[] = [
  "history",
  "intercept",
  "repeater",
  "intruder",
  "scanner",
];

function fromCatalog(
  id: SidebarPanel,
  overrides: Partial<Pick<ToolMenuItem, "id" | "label" | "shortName" | "hint" | "shortcut" | "intent" | "keywords">> = {},
): ToolMenuItem {
  const tool = PENTEST_TOOLS.find((item) => item.id === id);
  if (!tool) {
    throw new Error(`Unknown pentest tool: ${id}`);
  }
  return {
    id: overrides.id ?? tool.id,
    label: overrides.label ?? tool.label,
    shortName: overrides.shortName ?? tool.shortName,
    hint: overrides.hint ?? tool.hint,
    panel: tool.id,
    shortcut: overrides.shortcut,
    intent: overrides.intent,
    keywords: overrides.keywords ?? tool.keywords,
  };
}

/** Labelled Burp/Chrome-style menus on the pentest top bar. */
export const TOOL_MENU_GROUPS: ToolMenuGroup[] = [
  {
    id: "proxy",
    label: "Proxy",
    items: [
      fromCatalog("history"),
      fromCatalog("intercept", { shortcut: shortcutFor("toggle-intercept") }),
      fromCatalog("matchreplace"),
      fromCatalog("scope"),
      fromCatalog("websocket"),
    ],
  },
  {
    id: "attack",
    label: "Attack",
    items: [
      fromCatalog("repeater", { shortcut: shortcutFor("send-repeater") }),
      fromCatalog("intruder", { shortcut: shortcutFor("send-intruder") }),
      fromCatalog("scanner"),
      fromCatalog("smuggling"),
      fromCatalog("cors"),
      fromCatalog("paramminer"),
      fromCatalog("autorize"),
    ],
  },
  {
    id: "recon",
    label: "Recon",
    items: [
      fromCatalog("sitemap"),
      fromCatalog("discover"),
      fromCatalog("recon"),
      fromCatalog("graphql"),
      fromCatalog("oob"),
    ],
  },
  {
    id: "decode",
    label: "Decode",
    items: [
      fromCatalog("decode"),
      fromCatalog("decode", {
        id: "jwt",
        shortName: "JWT",
        label: "JWT editor",
        hint: "Decode, inspect claims, and tamper with JSON Web Tokens",
        intent: "jwt",
        keywords: "jwt token claims jws tamper",
      }),
      fromCatalog("comparer"),
      fromCatalog("sequencer"),
      fromCatalog("cookies"),
    ],
  },
  {
    id: "report",
    label: "Report",
    items: [
      fromCatalog("report", { shortName: "Findings", label: "Findings report" }),
      fromCatalog("notes"),
      fromCatalog("logger"),
      fromCatalog("notes", {
        id: "cvss",
        shortName: "CVSS",
        label: "CVSS scorer",
        hint: "Score a finding with CVSS 3.1 in Notes",
        intent: "cvss",
        keywords: "cvss score severity vector",
      }),
    ],
  },
];

export function allToolMenuItems(): ToolMenuItem[] {
  return TOOL_MENU_GROUPS.flatMap((group) => group.items);
}

export function groupForPanel(panel: SidebarPanel): ToolMenuGroup | undefined {
  return TOOL_MENU_GROUPS.find((group) => group.items.some((item) => item.panel === panel));
}

export function menuItemById(id: string): ToolMenuItem | undefined {
  return allToolMenuItems().find((item) => item.id === id);
}

export function catalogToolIds(): SidebarPanel[] {
  return PENTEST_TOOLS.map((item) => item.id);
}

/** Every catalog tool must appear in a menu so nothing is stranded off the bar. */
export function ungroupedCatalogTools(catalog: PentestToolDef[] = PENTEST_TOOLS): SidebarPanel[] {
  const covered = new Set(allToolMenuItems().map((item) => item.panel));
  return catalog.map((item) => item.id).filter((id) => !covered.has(id));
}

export function sanitizePinnedTools(value: unknown, fallback = DEFAULT_PINNED_TOOLS): SidebarPanel[] {
  const allowed = new Set(catalogToolIds());
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const next = value.filter((item): item is SidebarPanel => typeof item === "string" && allowed.has(item as SidebarPanel));
  return next.length ? Array.from(new Set(next)) : [...fallback];
}

export function togglePinned(current: SidebarPanel[], id: SidebarPanel): SidebarPanel[] {
  if (current.includes(id)) {
    const next = current.filter((item) => item !== id);
    return next.length ? next : current;
  }
  return [...current, id];
}

export function filterMenuItems(items: ToolMenuItem[], query: string): ToolMenuItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return items;
  }
  return items.filter((item) =>
    `${item.label} ${item.shortName} ${item.hint} ${item.keywords} ${item.panel}`.toLowerCase().includes(needle),
  );
}

export function filterAllMenus(query: string): ToolMenuItem[] {
  return filterMenuItems(allToolMenuItems(), query);
}
