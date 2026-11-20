import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { SessionState, SessionWindow } from "../shared/session";
import { hasRestorableTabs } from "../shared/session";

function filePath(): string {
  return join(app.getPath("userData"), "session.json");
}

export function loadSession(): SessionState | null {
  const file = filePath();
  if (!existsSync(file)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SessionState;
    if (!parsed || !Array.isArray(parsed.windows) || !hasRestorableTabs(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(windows: SessionWindow[]): void {
  const file = filePath();
  mkdirSync(dirname(file), { recursive: true });
  const session: SessionState = { windows: windows.filter((win) => win.tabs.length > 0) };
  writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

export function clearSession(): void {
  saveSession([]);
}
