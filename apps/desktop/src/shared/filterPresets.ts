import { browserStore, readJson, writeJson, type JsonStore } from "./localStore";

export type SavedFilterPreset = {
  id: string;
  name: string;
  query: string;
  savedAt: number;
};

export const FILTER_PRESETS_KEY = "lurkwire.traffic.filterPresets";

export function listFilterPresets(store: JsonStore = browserStore()): SavedFilterPreset[] {
  return readJson<SavedFilterPreset[]>(store, FILTER_PRESETS_KEY, []).slice().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveFilterPreset(
  name: string,
  query: string,
  store: JsonStore = browserStore(),
  now = Date.now(),
): SavedFilterPreset[] {
  const trimmed = name.trim() || query.trim() || "Untitled filter";
  const items = listFilterPresets(store);
  const existing = items.find((item) => item.name === trimmed);
  const next: SavedFilterPreset = {
    id: existing?.id ?? (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `f-${now}`),
    name: trimmed,
    query,
    savedAt: now,
  };
  const all = [next, ...items.filter((item) => item.id !== next.id)];
  writeJson(store, FILTER_PRESETS_KEY, all);
  return all;
}

export function deleteFilterPreset(id: string, store: JsonStore = browserStore()): SavedFilterPreset[] {
  const all = listFilterPresets(store).filter((item) => item.id !== id);
  writeJson(store, FILTER_PRESETS_KEY, all);
  return all;
}
