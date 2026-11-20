import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Bookmark } from "../shared/types";

function filePath(): string {
  return join(app.getPath("userData"), "bookmarks.json");
}

export function loadBookmarks(): Bookmark[] {
  const file = filePath();
  if (!existsSync(file)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Bookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(items: Bookmark[]): void {
  const file = filePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

export function addBookmark(input: { title: string; url: string }, existing: Bookmark[]): Bookmark[] {
  const url = input.url.trim();
  if (!url) {
    return existing;
  }
  const already = existing.find((item) => item.url === url);
  if (already) {
    return existing;
  }
  const next = [
    ...existing,
    {
      id: randomUUID(),
      title: input.title.trim() || url,
      url,
      createdAt: Date.now(),
    },
  ];
  persist(next);
  return next;
}

export function removeBookmark(id: string, existing: Bookmark[]): Bookmark[] {
  const next = existing.filter((item) => item.id !== id);
  persist(next);
  return next;
}
