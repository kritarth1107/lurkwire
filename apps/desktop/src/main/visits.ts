import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Visit } from "../shared/types";

const MAX_VISITS = 2000;

function visitsPath(): string {
  return join(app.getPath("userData"), "visits.json");
}

function load(): Visit[] {
  const file = visitsPath();
  if (!existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Visit[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: Visit[]): void {
  const file = visitsPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(items.slice(0, MAX_VISITS), null, 2)}\n`, "utf8");
}

export function recordVisit(url: string, title: string): void {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return;
  }
  const items = load();
  const now = Date.now();
  const existing = items.findIndex((item) => item.url === url);
  if (existing >= 0) {
    const current = items[existing]!;
    items.splice(existing, 1);
    items.unshift({
      ...current,
      title: title || current.title,
      visitedAt: now,
      count: current.count + 1,
    });
  } else {
    items.unshift({
      id: randomUUID(),
      url,
      title: title || url,
      visitedAt: now,
      count: 1,
    });
  }
  save(items);
}

export function listVisits(query?: string): Visit[] {
  const items = load();
  const q = query?.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(q));
}

export function deleteVisit(id: string): Visit[] {
  const items = load().filter((item) => item.id !== id);
  save(items);
  return items;
}

export function clearVisits(): void {
  save([]);
}
