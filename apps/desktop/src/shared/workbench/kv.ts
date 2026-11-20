import { newId } from "./id";
import type { WbKv } from "./types";

export function kv(key = "", value = "", enabled = true, extra: Partial<WbKv> = {}): WbKv {
  return { id: newId(), key, value, enabled, ...extra };
}

export function enabledKv(list: WbKv[]): WbKv[] {
  return list.filter((item) => item.enabled && item.key);
}

export function setKv(list: WbKv[], key: string, value: string, enabled = true): WbKv[] {
  const idx = list.findIndex((item) => item.key.toLowerCase() === key.toLowerCase());
  if (idx === -1) {
    return [...list, kv(key, value, enabled)];
  }
  return list.map((item, i) => (i === idx ? { ...item, value, enabled } : item));
}

export function removeKv(list: WbKv[], key: string): WbKv[] {
  return list.filter((item) => item.key.toLowerCase() !== key.toLowerCase());
}

export function findKv(list: WbKv[], key: string): WbKv | undefined {
  return list.find((item) => item.key.toLowerCase() === key.toLowerCase());
}
