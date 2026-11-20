import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { DEFAULT_LLM, DEFAULT_PREFS, type AppPrefs, type SidebarPanel } from "../shared/types";

const SIDEBAR_PANELS = new Set<SidebarPanel>([
  "history",
  "repeater",
  "intercept",
  "ai",
  "intruder",
  "decode",
  "recon",
  "scanner",
  "sitemap",
  "comparer",
  "logger",
  "sequencer",
]);

export function prefsPath(): string {
  return join(app.getPath("userData"), "prefs.json");
}

export function loadPrefs(): AppPrefs {
  const file = prefsPath();
  if (!existsSync(file)) {
    return { ...DEFAULT_PREFS };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<AppPrefs> & {
      verticalTabs?: boolean;
      sidebarPanel?: string;
    };
    const { verticalTabs: _removed, ...rest } = parsed;
    const panel = rest.sidebarPanel;
    return {
      ...DEFAULT_PREFS,
      ...rest,
      sidebarPanel: SIDEBAR_PANELS.has(panel as SidebarPanel)
        ? (panel as SidebarPanel)
        : DEFAULT_PREFS.sidebarPanel,
      llm: {
        ...DEFAULT_LLM,
        ...parsed.llm,
        connectors: { ...DEFAULT_LLM.connectors, ...(parsed.llm?.connectors ?? {}) },
        routing: { ...DEFAULT_LLM.routing, ...(parsed.llm?.routing ?? {}) },
      },
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: AppPrefs): void {
  const file = prefsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(prefs, null, 2)}\n`, "utf8");
}
