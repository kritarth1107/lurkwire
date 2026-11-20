import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { DEFAULT_LLM, DEFAULT_PREFS, type AppPrefs } from "../shared/types";

export function prefsPath(): string {
  return join(app.getPath("userData"), "prefs.json");
}

export function loadPrefs(): AppPrefs {
  const file = prefsPath();
  if (!existsSync(file)) {
    return { ...DEFAULT_PREFS };
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<AppPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      llm: { ...DEFAULT_LLM, ...parsed.llm },
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
