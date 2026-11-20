import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, dialog, session as electronSession, type BrowserWindow, type Session } from "electron";
import type { InstalledExtension, SavedExtension } from "../shared/extensions";

const watched = new Set<Session>();

function storePath(): string {
  return join(app.getPath("userData"), "extensions.json");
}

export function loadSavedExtensions(): SavedExtension[] {
  try {
    if (!existsSync(storePath())) {
      return [];
    }
    const parsed = JSON.parse(readFileSync(storePath(), "utf8")) as { items?: SavedExtension[] } | SavedExtension[];
    const items = Array.isArray(parsed) ? parsed : (parsed.items ?? []);
    return items.filter((item) => item && typeof item.path === "string" && existsSync(item.path));
  } catch {
    return [];
  }
}

function saveExtensions(items: SavedExtension[]) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(storePath(), `${JSON.stringify({ items }, null, 2)}\n`, "utf8");
}

export function watchSession(ses: Session) {
  watched.add(ses);
}

function persistentSessions(): Session[] {
  const live: Session[] = [];
  for (const ses of watched) {
    try {
      if (ses.isPersistent()) {
        live.push(ses);
      }
    } catch {
      watched.delete(ses);
    }
  }
  if (!live.includes(electronSession.defaultSession) && electronSession.defaultSession.isPersistent()) {
    live.push(electronSession.defaultSession);
  }
  return live;
}

export async function attachExtensions(ses: Session): Promise<void> {
  watchSession(ses);
  if (!ses.isPersistent()) {
    return;
  }
  const already = new Set(ses.getAllExtensions().map((item) => item.path));
  for (const item of loadSavedExtensions()) {
    if (already.has(item.path)) {
      continue;
    }
    try {
      await ses.loadExtension(item.path, { allowFileAccess: true });
    } catch (err) {
      console.warn(`Failed to load unpacked extension at ${item.path}:`, err);
    }
  }
}

export async function listExtensions(): Promise<InstalledExtension[]> {
  const byId = new Map<string, InstalledExtension>();
  for (const ses of persistentSessions()) {
    for (const ext of ses.getAllExtensions()) {
      byId.set(ext.id, {
        id: ext.id,
        name: ext.name,
        version: ext.version,
        path: ext.path,
        description: ext.manifest?.description ? String(ext.manifest.description) : "",
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function addUnpackedExtension(folder: string): Promise<InstalledExtension[]> {
  const saved = loadSavedExtensions();
  if (!saved.some((item) => item.path === folder)) {
    saved.push({ path: folder });
    saveExtensions(saved);
  }
  for (const ses of persistentSessions()) {
    const already = ses.getAllExtensions().some((item) => item.path === folder);
    if (!already) {
      await ses.loadExtension(folder, { allowFileAccess: true });
    }
  }
  return listExtensions();
}

export async function pickUnpackedExtension(win?: BrowserWindow | null): Promise<InstalledExtension[] | null> {
  const options = {
    title: "Load unpacked extension",
    properties: ["openDirectory"] as Array<"openDirectory">,
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  return addUnpackedExtension(result.filePaths[0]);
}

export async function removeUnpackedExtension(id: string): Promise<InstalledExtension[]> {
  let path = "";
  for (const ses of persistentSessions()) {
    const found = ses.getAllExtensions().find((item) => item.id === id);
    if (found) {
      path = found.path;
      ses.removeExtension(id);
    }
  }
  if (path) {
    saveExtensions(loadSavedExtensions().filter((item) => item.path !== path));
  }
  return listExtensions();
}
