import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CHROME_PROFILE_PARENTS,
  chromeBrowserLabel,
  chromeTimeToMs,
  firefoxTimeToMs,
  isImportableUrl,
  parseChromeBookmarks,
  parseFirefoxBookmarks,
  parseFirefoxProfilesIni,
  type ImportedBookmark,
  type ImportedVisit,
  type ImportSource,
} from "../shared/browserImport";

export type { ImportedBookmark, ImportedVisit, ImportSource };

function home(): string {
  return process.env.HOME || homedir();
}

function listChromeSources(): ImportSource[] {
  const found: ImportSource[] = [];
  for (const relative of CHROME_PROFILE_PARENTS) {
    const root = join(home(), relative);
    if (!existsSync(root)) {
      continue;
    }
    const label = chromeBrowserLabel(relative);
    const names = ["Default", "Profile 1", "Profile 2", "Profile 3", "Profile 4", "Profile 5"];
    // Also pick any directory that contains a Bookmarks file.
    const extra = safeDirs(root).filter((name) => !names.includes(name) && existsSync(join(root, name, "Bookmarks")));
    for (const name of [...names, ...extra]) {
      const profileDir = join(root, name);
      const bookmarksPath = join(profileDir, "Bookmarks");
      const historyPath = join(profileDir, "History");
      const hasBookmarks = existsSync(bookmarksPath);
      const hasHistory = existsSync(historyPath);
      if (!hasBookmarks && !hasHistory) {
        continue;
      }
      found.push({
        id: `chrome:${profileDir}`,
        kind: "chrome",
        name: `${label} (${name})`,
        profileDir,
        bookmarksPath: hasBookmarks ? bookmarksPath : null,
        historyPath: hasHistory ? historyPath : null,
      });
    }
  }
  return found;
}

function safeDirs(root: string): string[] {
  try {
    return readdirSync(root).filter((name) => {
      try {
        return statSync(join(root, name)).isDirectory();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

function listFirefoxSources(): ImportSource[] {
  const base = join(home(), ".mozilla/firefox");
  const ini = join(base, "profiles.ini");
  if (!existsSync(ini)) {
    return [];
  }
  let text = "";
  try {
    text = readFileSync(ini, "utf8");
  } catch {
    return [];
  }
  const sources: ImportSource[] = [];
  for (const profile of parseFirefoxProfilesIni(text, base)) {
    const bookmarksPath = join(profile.path, "places.sqlite");
    const has = existsSync(bookmarksPath);
    if (!has) {
      continue;
    }
    sources.push({
      id: `firefox:${profile.path}`,
      kind: "firefox",
      name: `Firefox (${profile.name})`,
      profileDir: profile.path,
      bookmarksPath,
      historyPath: bookmarksPath,
    });
  }
  return sources;
}

export function listImportSources(): ImportSource[] {
  return [...listChromeSources(), ...listFirefoxSources()];
}

export function readChromeBookmarks(file: string): ImportedBookmark[] {
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  return parseChromeBookmarks(raw);
}

export function readChromeHistory(file: string): ImportedVisit[] {
  return withCopiedDb(file, (db) => {
    const rows = db
      .prepare(
        "SELECT url, title, visit_count, last_visit_time FROM urls WHERE url IS NOT NULL ORDER BY last_visit_time DESC LIMIT 2000",
      )
      .all() as Array<{ url: string; title: string | null; visit_count: number | null; last_visit_time: number | null }>;
    return rows
      .filter((row) => isImportableUrl(row.url))
      .map((row) => ({
        title: (row.title || row.url).trim(),
        url: row.url.trim(),
        visitedAt: chromeTimeToMs(Number(row.last_visit_time ?? 0)) || Date.now(),
        count: Math.max(1, Number(row.visit_count ?? 1)),
      }));
  });
}

export function readFirefoxPlaces(file: string): { bookmarks: ImportedBookmark[]; visits: ImportedVisit[] } {
  return withCopiedDb(file, (db) => {
    const bookmarkRows = db
      .prepare(
        `SELECT b.id, b.type, b.parent, b.title, p.url, b.dateAdded
         FROM moz_bookmarks b
         LEFT JOIN moz_places p ON p.id = b.fk`,
      )
      .all() as Array<{
      id: number;
      type: number;
      parent: number;
      title: string | null;
      url: string | null;
      dateAdded: number | null;
    }>;
    const bookmarks = parseFirefoxBookmarks(bookmarkRows);
    const visitRows = db
      .prepare(
        `SELECT p.url, p.title, p.visit_count, p.last_visit_date
         FROM moz_places p
         WHERE p.url IS NOT NULL
         ORDER BY p.last_visit_date DESC
         LIMIT 2000`,
      )
      .all() as Array<{ url: string; title: string | null; visit_count: number | null; last_visit_date: number | null }>;
    const visits = visitRows
      .filter((row) => isImportableUrl(row.url))
      .map((row) => ({
        title: (row.title || row.url).trim(),
        url: row.url.trim(),
        visitedAt: firefoxTimeToMs(Number(row.last_visit_date ?? 0)) || Date.now(),
        count: Math.max(1, Number(row.visit_count ?? 1)),
      }));
    return { bookmarks, visits };
  });
}

export type ImportRequest = { bookmarks: boolean; history: boolean };

export type ImportResult = {
  sourceId: string;
  name: string;
  bookmarks: number;
  visits: number;
};

export function importFromSource(source: ImportSource, request: ImportRequest): { bookmarks: ImportedBookmark[]; visits: ImportedVisit[]; result: ImportResult } {
  let bookmarks: ImportedBookmark[] = [];
  let visits: ImportedVisit[] = [];
  if (source.kind === "chrome") {
    if (request.bookmarks && source.bookmarksPath) {
      bookmarks = readChromeBookmarks(source.bookmarksPath);
    }
    if (request.history && source.historyPath) {
      visits = readChromeHistory(source.historyPath);
    }
  } else if (source.historyPath || source.bookmarksPath) {
    const file = source.bookmarksPath ?? source.historyPath!;
    const parsed = readFirefoxPlaces(file);
    if (request.bookmarks) {
      bookmarks = parsed.bookmarks;
    }
    if (request.history) {
      visits = parsed.visits;
    }
  }
  return {
    bookmarks,
    visits,
    result: {
      sourceId: source.id,
      name: source.name,
      bookmarks: bookmarks.length,
      visits: visits.length,
    },
  };
}

function withCopiedDb<T>(file: string, fn: (db: DatabaseSync) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "lurkwire-import-"));
  const dest = join(dir, "places.sqlite");
  copyFileSync(file, dest);
  for (const suffix of ["-wal", "-shm"]) {
    if (existsSync(file + suffix)) {
      try {
        copyFileSync(file + suffix, dest + suffix);
      } catch {
        // the live browser may hold a lock; the main db copy is still useful
      }
    }
  }
  const db = new DatabaseSync(dest, { readOnly: true });
  try {
    return fn(db);
  } finally {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

