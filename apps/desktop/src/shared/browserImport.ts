export type ImportedBookmark = {
  title: string;
  url: string;
  folder: string;
  createdAt: number;
};

export type ImportedVisit = {
  title: string;
  url: string;
  visitedAt: number;
  count: number;
};

export type ImportSourceKind = "chrome" | "firefox";

export type ImportSource = {
  id: string;
  kind: ImportSourceKind;
  name: string;
  profileDir: string;
  bookmarksPath: string | null;
  historyPath: string | null;
};

const CHROME_EPOCH = Date.UTC(1601, 0, 1);

export function chromeTimeToMs(webkitTime: number): number {
  if (!Number.isFinite(webkitTime) || webkitTime <= 0) {
    return 0;
  }
  return Math.round(CHROME_EPOCH + webkitTime / 1000);
}

export function firefoxTimeToMs(microseconds: number): number {
  if (!Number.isFinite(microseconds) || microseconds <= 0) {
    return 0;
  }
  return Math.round(microseconds / 1000);
}

export function isImportableUrl(url: string): boolean {
  return /^(https?:|ftp:)/i.test(url.trim());
}

type ChromeNode = {
  type?: string;
  name?: string;
  url?: string;
  date_added?: string;
  children?: ChromeNode[];
};

export function parseChromeBookmarks(raw: unknown, now = Date.now()): ImportedBookmark[] {
  const roots = (raw as { roots?: Record<string, ChromeNode> })?.roots ?? {};
  const items: ImportedBookmark[] = [];
  const walk = (node: ChromeNode | undefined, folder: string) => {
    if (!node) {
      return;
    }
    if ((node.type === "url" || Boolean(node.url && !node.children)) && node.url && isImportableUrl(node.url)) {
      const created = node.date_added ? chromeTimeToMs(Number(node.date_added)) : now;
      items.push({
        title: (node.name || node.url).trim(),
        url: node.url.trim(),
        folder,
        createdAt: created || now,
      });
    }
    for (const child of node.children ?? []) {
      if (child.type === "folder") {
        const name = (child.name || "Folder").trim();
        walk(child, folder ? `${folder}/${name}` : name);
      } else {
        walk(child, folder);
      }
    }
  };
  const labels: Record<string, string> = {
    bookmark_bar: "Bookmarks bar",
    other: "Other bookmarks",
    synced: "Mobile bookmarks",
  };
  for (const [key, node] of Object.entries(roots)) {
    walk(node, labels[key] ?? node.name ?? "");
  }
  return items;
}

export type FirefoxBookmarkRow = {
  id: number;
  type: number;
  parent: number;
  title: string | null;
  url: string | null;
  dateAdded: number | null;
};

export function parseFirefoxBookmarks(rows: FirefoxBookmarkRow[], now = Date.now()): ImportedBookmark[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const folderPath = (id: number, seen = new Set<number>()): string => {
    const row = byId.get(id);
    if (!row || seen.has(id)) {
      return "";
    }
    seen.add(id);
    if (row.parent <= 0 || row.id === 1) {
      return "";
    }
    const parent = folderPath(row.parent, seen);
    const name = (row.type === 2 ? row.title : "")?.trim();
    if (!name || name === "menu" || name === "toolbar" || name === "unfiled" || name === "mobile") {
      const roots: Record<string, string> = {
        toolbar: "Bookmarks toolbar",
        menu: "Bookmarks menu",
        unfiled: "Other bookmarks",
        mobile: "Mobile bookmarks",
      };
      const label = roots[name ?? ""] ?? "";
      return parent && label ? `${parent}/${label}` : parent || label;
    }
    return parent ? `${parent}/${name}` : name;
  };
  const items: ImportedBookmark[] = [];
  for (const row of rows) {
    if (row.type !== 1 || !row.url || !isImportableUrl(row.url)) {
      continue;
    }
    const parent = byId.get(row.parent);
    items.push({
      title: (row.title || row.url).trim(),
      url: row.url.trim(),
      folder: parent ? folderPath(parent.id) : "",
      createdAt: row.dateAdded ? firefoxTimeToMs(row.dateAdded) : now,
    });
  }
  return items;
}

export type ProfileIniSection = { name: string; path: string; isRelative: boolean; isDefault: boolean };

export function parseFirefoxProfilesIni(text: string, baseDir: string): { path: string; name: string }[] {
  const sections: ProfileIniSection[] = [];
  let current: Partial<ProfileIniSection> | null = null;
  const flush = () => {
    if (current?.path) {
      sections.push({
        name: current.name ?? "Firefox",
        path: current.path,
        isRelative: current.isRelative ?? true,
        isDefault: current.isDefault ?? false,
      });
    }
    current = null;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("[") && line.endsWith("]")) {
      flush();
      const heading = line.slice(1, -1);
      if (/^Profile/i.test(heading)) {
        current = { name: heading };
      } else {
        current = null;
      }
      continue;
    }
    if (!current) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq < 0) {
      continue;
    }
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();
    if (key === "path") {
      current.path = value;
    } else if (key === "name") {
      current.name = value;
    } else if (key === "isrelative") {
      current.isRelative = value === "1";
    } else if (key === "default") {
      current.isDefault = value === "1";
    }
  }
  flush();
  return sections.map((section) => ({
    name: section.name || "Firefox",
    path: section.isRelative ? `${baseDir.replace(/\/$/, "")}/${section.path}` : section.path,
  }));
}

export const CHROME_PROFILE_PARENTS = [
  ".config/google-chrome",
  ".config/google-chrome-beta",
  ".config/google-chrome-unstable",
  ".config/chromium",
  ".config/brave-browser",
  ".config/microsoft-edge",
];

export function chromeBrowserLabel(parent: string): string {
  if (parent.includes("brave")) {
    return "Brave";
  }
  if (parent.includes("microsoft-edge") || parent.includes("microsoft_edge")) {
    return "Edge";
  }
  if (parent.includes("chromium")) {
    return "Chromium";
  }
  if (parent.includes("beta")) {
    return "Chrome Beta";
  }
  if (parent.includes("unstable")) {
    return "Chrome Unstable";
  }
  return "Chrome";
}
