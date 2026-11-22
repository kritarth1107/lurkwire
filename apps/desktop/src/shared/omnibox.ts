export const DEFAULT_SEARCH_URL = "https://www.google.com/search?q=";

const OPAQUE_SCHEME = /^(about|mailto|data|javascript|blob|view-source|lurkwire):/i;
const AUTHORITATIVE_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const LOCALHOST = /^(localhost|local)(:\d{1,5})?([/?#].*)?$/i;
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}(:\d{1,5})?([/?#].*)?$/;
const IPV6 = /^\[[0-9a-fA-F:]+\](:\d{1,5})?([/?#].*)?$/;
const HOSTPORT = /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)(?::(\d{1,5}))?(?:[/?#].*)?$/;

export type OmniboxKind = "url" | "search";

export type OmniboxResolution = {
  kind: OmniboxKind;
  /** Destination the address bar should navigate to. */
  url: string;
  /** Original trimmed input. */
  query: string;
};

export type OmniboxSuggestionKind = "navigate" | "search" | "suggest" | "history" | "bookmark";

export type OmniboxSuggestion = {
  id: string;
  kind: OmniboxSuggestionKind;
  title: string;
  url: string;
  subtitle?: string;
  favicon?: string;
  /** Text used for inline autocomplete of the top hit. */
  completion?: string;
};

export type VisitMatch = {
  id: string;
  url: string;
  title: string;
  count?: number;
};

export type BookmarkMatch = {
  id: string;
  url: string;
  title: string;
};

function hasScheme(input: string): boolean {
  return OPAQUE_SCHEME.test(input) || AUTHORITATIVE_SCHEME.test(input);
}

function octetsOk(host: string): boolean {
  return host.split(".").every((part) => {
    if (!/^\d{1,3}$/.test(part)) {
      return false;
    }
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/**
 * True when the input should be navigated as a host or URL rather than
 * sent to a search engine: a scheme, localhost, an IP, or a hostname
 * with a 2+ letter TLD.
 */
export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return false;
  }
  if (hasScheme(trimmed)) {
    return true;
  }
  if (LOCALHOST.test(trimmed)) {
    return true;
  }
  const ipv4 = trimmed.match(IPV4);
  if (ipv4) {
    const host = trimmed.split(/[:/?#]/)[0] ?? "";
    return octetsOk(host);
  }
  if (IPV6.test(trimmed)) {
    return true;
  }
  const match = trimmed.match(HOSTPORT);
  if (!match) {
    return false;
  }
  const host = match[1] ?? "";
  if (!host.includes(".")) {
    return false;
  }
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) {
    return false;
  }
  const tld = host.slice(host.lastIndexOf(".") + 1);
  return /^[a-zA-Z]{2,24}$/.test(tld) || /^xn--[a-zA-Z0-9-]{2,}$/.test(tld);
}

export function searchUrl(query: string, template = DEFAULT_SEARCH_URL): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return "";
  }
  if (template.includes("%s")) {
    return template.replace("%s", encodeURIComponent(trimmed));
  }
  return `${template}${encodeURIComponent(trimmed)}`;
}

export function resolveOmnibox(input: string, template = DEFAULT_SEARCH_URL): OmniboxResolution {
  const query = input.trim();
  if (!query) {
    return { kind: "url", url: "", query };
  }
  if (looksLikeUrl(query)) {
    if (hasScheme(query)) {
      return { kind: "url", url: query, query };
    }
    return { kind: "url", url: `https://${query}`, query };
  }
  return { kind: "search", url: searchUrl(query, template), query };
}

export function faviconForUrl(pageUrl: string): string {
  try {
    const href = pageUrl.includes("://") ? pageUrl : `https://${pageUrl}`;
    const host = new URL(href).hostname;
    if (!host) {
      return "";
    }
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch {
    return "";
  }
}

function displayHost(pageUrl: string): string {
  try {
    const href = pageUrl.includes("://") ? pageUrl : `https://${pageUrl}`;
    return new URL(href).host || pageUrl;
  } catch {
    return pageUrl;
  }
}

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query.toLowerCase());
}

function prefixCompletion(query: string, url: string): string | undefined {
  const q = query.trim();
  if (!q) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    const full = `${parsed.host}${parsed.pathname}${parsed.search}`;
    if (host.toLowerCase().startsWith(q.toLowerCase()) && host.length > q.length) {
      return host + (parsed.pathname === "/" && !parsed.search ? "" : `${parsed.pathname}${parsed.search}`);
    }
    if (full.toLowerCase().startsWith(q.toLowerCase()) && full.length > q.length) {
      return full;
    }
    if (url.toLowerCase().startsWith(q.toLowerCase()) && url.length > q.length) {
      return url;
    }
  } catch {
    if (url.toLowerCase().startsWith(q.toLowerCase()) && url.length > q.length) {
      return url;
    }
  }
  return undefined;
}

export function buildOmniboxSuggestions(input: {
  query: string;
  visits?: VisitMatch[];
  bookmarks?: BookmarkMatch[];
  searchSuggestions?: string[];
  searchTemplate?: string;
  searchEngineName?: string;
}): OmniboxSuggestion[] {
  const query = input.query.trim();
  if (!query) {
    return [];
  }
  const template = input.searchTemplate ?? DEFAULT_SEARCH_URL;
  const engine = input.searchEngineName ?? "Google";
  const resolved = resolveOmnibox(query, template);
  const visits = input.visits ?? [];
  const bookmarks = input.bookmarks ?? [];
  const seen = new Set<string>();
  const items: OmniboxSuggestion[] = [];

  const push = (item: OmniboxSuggestion) => {
    const key = `${item.kind}:${item.url}`;
    if (seen.has(key) || !item.url) {
      return;
    }
    seen.add(key);
    items.push(item);
  };

  const prefixVisit = visits.find((item) => prefixCompletion(query, item.url) || item.title.toLowerCase().startsWith(query.toLowerCase()));
  if (resolved.kind === "url") {
    push({
      id: "top-navigate",
      kind: "navigate",
      title: resolved.query,
      subtitle: "Open URL",
      url: resolved.url,
      favicon: faviconForUrl(resolved.url),
      completion: looksLikeUrl(query) && !hasScheme(query) ? query : resolved.url,
    });
  } else if (prefixVisit) {
    const completion = prefixCompletion(query, prefixVisit.url) ?? prefixVisit.url;
    push({
      id: `top-history-${prefixVisit.id}`,
      kind: "history",
      title: prefixVisit.title || prefixVisit.url,
      subtitle: prefixVisit.url,
      url: prefixVisit.url,
      favicon: faviconForUrl(prefixVisit.url),
      completion,
    });
  }

  if (resolved.kind === "search") {
    push({
      id: "top-search",
      kind: "search",
      title: query,
      subtitle: `Search ${engine}`,
      url: resolved.url,
      completion: query,
    });
  }

  for (const phrase of (input.searchSuggestions ?? []).slice(0, 6)) {
    const text = phrase.trim();
    if (!text || text.toLowerCase() === query.toLowerCase()) {
      continue;
    }
    push({
      id: `suggest-${text}`,
      kind: "suggest",
      title: text,
      subtitle: `${engine} suggestion`,
      url: searchUrl(text, template),
    });
  }

  const library: Array<{ kind: "history" | "bookmark"; id: string; url: string; title: string }> = [
    ...visits.map((item) => ({ kind: "history" as const, id: item.id, url: item.url, title: item.title })),
    ...bookmarks.map((item) => ({ kind: "bookmark" as const, id: item.id, url: item.url, title: item.title })),
  ];
  for (const item of library) {
    if (!matchesQuery(`${item.title} ${item.url}`, query)) {
      continue;
    }
    push({
      id: `${item.kind}-${item.id}`,
      kind: item.kind,
      title: item.title || item.url,
      subtitle: item.kind === "bookmark" ? `Bookmark · ${displayHost(item.url)}` : item.url,
      url: item.url,
      favicon: faviconForUrl(item.url),
    });
  }

  return items.slice(0, 12);
}
