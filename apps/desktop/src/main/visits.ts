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

export function importVisits(incoming: { url: string; title: string; visitedAt: number; count: number }[]): { items: Visit[]; added: number } {
  const items = load();
  const byUrl = new Map(items.map((item) => [item.url, item]));
  let added = 0;
  for (const visit of incoming) {
    const url = visit.url.trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      continue;
    }
    const current = byUrl.get(url);
    if (current) {
      current.title = visit.title || current.title;
      current.visitedAt = Math.max(current.visitedAt, visit.visitedAt || current.visitedAt);
      current.count = Math.max(current.count, visit.count || 1);
    } else {
      const created: Visit = {
        id: randomUUID(),
        url,
        title: visit.title.trim() || url,
        visitedAt: visit.visitedAt || Date.now(),
        count: Math.max(1, visit.count || 1),
      };
      items.push(created);
      byUrl.set(url, created);
      added += 1;
    }
  }
  items.sort((a, b) => b.visitedAt - a.visitedAt);
  save(items);
  return { items: listVisits(), added };
}
