import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { emptyNotes, exportFindingsMarkdown, type NotesStore } from "../shared/notes";
import type { Finding } from "../shared/types";

function pathOf(): string {
  return join(app.getPath("userData"), "notes.json");
}

export function loadNotes(): NotesStore {
  const file = pathOf();
  if (!existsSync(file)) {
    return emptyNotes();
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as NotesStore;
    return { version: 1, notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
  } catch {
    return emptyNotes();
  }
}

export function saveNotes(store: NotesStore): NotesStore {
  const file = pathOf();
  mkdirSync(dirname(file), { recursive: true });
  const next: NotesStore = { version: 1, notes: store.notes ?? [] };
  writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

export function exportNotesMarkdown(scanner: Finding[]): string {
  return exportFindingsMarkdown(loadNotes().notes, scanner);
}
