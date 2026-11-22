/** Tiny JSON store used by saved Intruder lists, Repeater collections, and filter presets. */

export type JsonStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function memoryStore(initial: Record<string, string> = {}): JsonStore {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = value;
    },
    removeItem(key) {
      delete data[key];
    },
  };
}

export function browserStore(): JsonStore {
  if (typeof localStorage === "undefined") {
    return memoryStore();
  }
  return localStorage;
}

export function readJson<T>(store: JsonStore, key: string, fallback: T): T {
  const raw = store.getItem(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(store: JsonStore, key: string, value: unknown): void {
  store.setItem(key, JSON.stringify(value));
}
