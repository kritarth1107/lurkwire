import { browserStore, readJson, writeJson, type JsonStore } from "./localStore";

export type SavedPayloadList = {
  id: string;
  name: string;
  text: string;
  savedAt: number;
};

export const INTRUDER_LISTS_KEY = "lurkwire.intruder.payloadLists";

export function listPayloadLists(store: JsonStore = browserStore()): SavedPayloadList[] {
  const items = readJson<SavedPayloadList[]>(store, INTRUDER_LISTS_KEY, []);
  return items.slice().sort((a, b) => b.savedAt - a.savedAt);
}

export function savePayloadList(
  name: string,
  text: string,
  store: JsonStore = browserStore(),
  id?: string,
  now = Date.now(),
): SavedPayloadList[] {
  const trimmed = name.trim() || "Untitled list";
  const items = listPayloadLists(store);
  const existing = id ? items.find((item) => item.id === id) : items.find((item) => item.name === trimmed);
  const next: SavedPayloadList = {
    id: existing?.id ?? cryptoRandomId(),
    name: trimmed,
    text,
    savedAt: now,
  };
  const others = items.filter((item) => item.id !== next.id);
  const all = [next, ...others];
  writeJson(store, INTRUDER_LISTS_KEY, all);
  return all;
}

export function deletePayloadList(id: string, store: JsonStore = browserStore()): SavedPayloadList[] {
  const all = listPayloadLists(store).filter((item) => item.id !== id);
  writeJson(store, INTRUDER_LISTS_KEY, all);
  return all;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `list-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}
