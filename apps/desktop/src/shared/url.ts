export const INTERNAL_PAGES = [
  "settings",
  "downloads",
  "history",
  "bookmarks",
  "extensions",
  "workbench",
  "newtab",
  "about",
] as const;

export type InternalPage = (typeof INTERNAL_PAGES)[number];

export const INTERNAL_TITLES: Record<InternalPage, string> = {
  settings: "Settings",
  downloads: "Downloads",
  history: "History",
  bookmarks: "Bookmarks",
  extensions: "Extensions",
  workbench: "Workbench",
  newtab: "New Tab",
  about: "About Lurkwire",
};

const ALIASES: Record<string, InternalPage> = {
  "about:preferences": "settings",
  "about:settings": "settings",
  "about:config": "settings",
  "about:blank": "newtab",
  "about:newtab": "newtab",
  "about:home": "newtab",
  "about:downloads": "downloads",
  "about:history": "history",
  "about:bookmarks": "bookmarks",
  "about:addons": "extensions",
  "about:workbench": "workbench",
  "about:about": "about",
  "about:lurkwire": "about",
  "chrome://settings": "settings",
  "chrome://downloads": "downloads",
  "chrome://history": "history",
  "chrome://bookmarks": "bookmarks",
  "chrome://extensions": "extensions",
  "lurkwire://api": "workbench",
  "lurkwire://postman": "workbench",
  "chrome://newtab": "newtab",
  "chrome://new-tab-page": "newtab",
};

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return canonicalizeInternalUrl(trimmed) ?? trimmed;
  }
  return `https://${trimmed}`;
}

export function displayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function parseInternalPage(url: string): InternalPage | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return "newtab";
  }
  const lower = trimmed.toLowerCase();
  const withoutHash = lower.split("#")[0]?.replace(/\/$/, "") ?? lower;
  if (ALIASES[lower]) {
    return ALIASES[lower] ?? null;
  }
  if (ALIASES[withoutHash]) {
    return ALIASES[withoutHash] ?? null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "lurkwire:") {
      const host = (parsed.hostname || parsed.host || "").toLowerCase();
      if ((INTERNAL_PAGES as readonly string[]).includes(host)) {
        return host as InternalPage;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function canonicalizeInternalUrl(url: string): string | null {
  const page = parseInternalPage(url);
  if (!page) {
    return null;
  }
  if (!url.trim()) {
    return "lurkwire://newtab";
  }
  let hash = "";
  try {
    hash = new URL(url.includes("://") || url.startsWith("about:") ? url : `https://x/${url}`).hash;
    if (url.startsWith("about:") || url.startsWith("chrome:")) {
      hash = "";
    }
  } catch {
    hash = "";
  }
  return `lurkwire://${page}${hash}`;
}

export function isInternalUrl(url: string): boolean {
  return parseInternalPage(url) !== null;
}

export function isSettingsUrl(url: string): boolean {
  return parseInternalPage(url) === "settings";
}

export function isNewTabUrl(url: string): boolean {
  return parseInternalPage(url) === "newtab";
}

export function titleForInternalPage(url: string): string {
  const page = parseInternalPage(url);
  return page ? INTERNAL_TITLES[page] : "Lurkwire";
}
