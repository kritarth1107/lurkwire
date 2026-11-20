import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import type { Bookmark } from "../shared/types";
import type { ImportedBookmark } from "../shared/browserImport";

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

export function addBookmark(input: { title: string; url: string; folder?: string }, existing: Bookmark[]): Bookmark[] {
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
      folder: input.folder?.trim() || undefined,
    },
  ];
  persist(next);
  return next;
}

export function updateBookmark(id: string, patch: { title?: string; url?: string; folder?: string }, existing: Bookmark[]): Bookmark[] {
  const next = existing.map((item) => {
    if (item.id !== id) {
      return item;
    }
    const url = patch.url !== undefined ? patch.url.trim() : item.url;
    return {
      ...item,
      title: patch.title !== undefined ? patch.title.trim() || url : item.title,
      url: url || item.url,
      folder: patch.folder !== undefined ? patch.folder.trim() || undefined : item.folder,
    };
  });
  persist(next);
  return next;
}

export function removeBookmark(id: string, existing: Bookmark[]): Bookmark[] {
  const next = existing.filter((item) => item.id !== id);
  persist(next);
  return next;
}

export function importBookmarks(incoming: ImportedBookmark[], existing: Bookmark[]): { items: Bookmark[]; added: number } {
  const seen = new Set(existing.map((item) => item.url));
  const added: Bookmark[] = [];
  for (const item of incoming) {
    const url = item.url.trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    added.push({
      id: randomUUID(),
      title: item.title.trim() || url,
      url,
      createdAt: item.createdAt || Date.now(),
      folder: item.folder?.trim() || undefined,
    });
  }
  const items = [...existing, ...added];
  persist(items);
  return { items, added: added.length };
}
