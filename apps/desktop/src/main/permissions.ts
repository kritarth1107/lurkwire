import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, type Session } from "electron";
import type { SitePermission } from "../shared/siteInfo";

function filePath(): string {
  return join(app.getPath("userData"), "permissions.json");
}

export function listPermissions(origin?: string): SitePermission[] {
  const all = load();
  if (!origin) {
    return all;
  }
  return all.filter((item) => item.origin === origin);
}

export function recordPermission(origin: string, permission: string, state: "granted" | "denied"): void {
  const items = load().filter((item) => !(item.origin === origin && item.permission === permission));
  items.unshift({ origin, permission, state, at: Date.now() });
  save(items.slice(0, 2000));
}

export function hookPermissionHandler(ses: Session): void {
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const rec = details as { requestingUrl?: string; securityOrigin?: string };
    const origin = originOf(rec.requestingUrl || rec.securityOrigin || "");
    recordPermission(origin || "unknown", permission, "granted");
    callback(true);
  });
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function load(): SitePermission[] {
  const file = filePath();
  if (!existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as SitePermission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: SitePermission[]): void {
  const file = filePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}
