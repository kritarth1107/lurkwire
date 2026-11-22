import type { FlowDetail, HeaderPair } from "./types";
import { browserStore, readJson, writeJson, type JsonStore } from "./localStore";

export type RepeaterHistoryEntry = {
  id: string;
  method: string;
  url: string;
  path: string;
  host: string;
  status: number | null;
  req_headers: HeaderPair[];
  resp_headers: HeaderPair[];
  req_preview?: string;
  resp_preview?: string;
  pinned?: boolean;
  comment?: string;
  ts?: number;
};

export type RepeaterTabSnapshot = {
  id: string;
  name: string;
  url: string;
  raw: string;
  history: RepeaterHistoryEntry[];
  selectedIndex: number;
};

export type RepeaterCollection = {
  id: string;
  name: string;
  tabs: RepeaterTabSnapshot[];
  savedAt: number;
};

export const REPEATER_SESSION_KEY = "lurkwire.repeater.session";
export const REPEATER_COLLECTIONS_KEY = "lurkwire.repeater.collections";

const PREVIEW_CAP = 8_000;
const HISTORY_CAP = 20;

export function compactFlow(flow: FlowDetail, extra?: { pinned?: boolean; comment?: string }): RepeaterHistoryEntry {
  return {
    id: flow.id,
    method: flow.method,
    url: flow.url,
    path: flow.path,
    host: flow.host,
    status: flow.status,
    req_headers: flow.req_headers,
    resp_headers: flow.resp_headers,
    req_preview: (flow.req_preview ?? "").slice(0, PREVIEW_CAP) || undefined,
    resp_preview: (flow.resp_preview ?? "").slice(0, PREVIEW_CAP) || undefined,
    pinned: extra?.pinned,
    comment: extra?.comment,
    ts: flow.ts,
  };
}

export function entryToFlow(entry: RepeaterHistoryEntry): FlowDetail {
  return {
    id: entry.id,
    project_id: "",
    ts: entry.ts ?? 0,
    method: entry.method,
    scheme: entry.url.startsWith("https") ? "https" : "http",
    host: entry.host,
    port: 0,
    path: entry.path,
    query: "",
    url: entry.url,
    http_version: "HTTP/1.1",
    status: entry.status,
    req_len: entry.req_preview?.length ?? 0,
    resp_len: entry.resp_preview?.length ?? 0,
    duration_ms: null,
    source: "repeater",
    mime: null,
    in_scope: true,
    truncated: false,
    tags: [],
    note: entry.comment ?? "",
    req_headers: entry.req_headers ?? [],
    resp_headers: entry.resp_headers ?? [],
    req_blob: null,
    resp_blob: null,
    req_preview: entry.req_preview,
    resp_preview: entry.resp_preview,
  } as FlowDetail;
}

export function capHistory(history: RepeaterHistoryEntry[]): RepeaterHistoryEntry[] {
  const pinned = history.filter((item) => item.pinned);
  const rest = history.filter((item) => !item.pinned);
  return [...pinned, ...rest].slice(0, HISTORY_CAP);
}

export function loadRepeaterSession(store: JsonStore = browserStore()): RepeaterTabSnapshot[] {
  return readJson<RepeaterTabSnapshot[]>(store, REPEATER_SESSION_KEY, []);
}

export function saveRepeaterSession(tabs: RepeaterTabSnapshot[], store: JsonStore = browserStore()): void {
  const compact = tabs.map((tab) => ({
    ...tab,
    history: capHistory(tab.history),
  }));
  writeJson(store, REPEATER_SESSION_KEY, compact);
}

export function listRepeaterCollections(store: JsonStore = browserStore()): RepeaterCollection[] {
  return readJson<RepeaterCollection[]>(store, REPEATER_COLLECTIONS_KEY, [])
    .slice()
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveRepeaterCollection(
  name: string,
  tabs: RepeaterTabSnapshot[],
  store: JsonStore = browserStore(),
  now = Date.now(),
): RepeaterCollection[] {
  const trimmed = name.trim() || "Untitled collection";
  const items = listRepeaterCollections(store);
  const existing = items.find((item) => item.name === trimmed);
  const next: RepeaterCollection = {
    id: existing?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${now}`),
    name: trimmed,
    tabs: tabs.map((tab) => ({ ...tab, history: capHistory(tab.history) })),
    savedAt: now,
  };
  const all = [next, ...items.filter((item) => item.id !== next.id)];
  writeJson(store, REPEATER_COLLECTIONS_KEY, all);
  return all;
}

export function deleteRepeaterCollection(id: string, store: JsonStore = browserStore()): RepeaterCollection[] {
  const all = listRepeaterCollections(store).filter((item) => item.id !== id);
  writeJson(store, REPEATER_COLLECTIONS_KEY, all);
  return all;
}

export function togglePin(history: RepeaterHistoryEntry[], id: string): RepeaterHistoryEntry[] {
  return history.map((item) => (item.id === id ? { ...item, pinned: !item.pinned } : item));
}

export function setComment(history: RepeaterHistoryEntry[], id: string, comment: string): RepeaterHistoryEntry[] {
  return history.map((item) => (item.id === id ? { ...item, comment } : item));
}
