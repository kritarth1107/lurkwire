import type { WbKv } from "./types";

export type VariableMap = Record<string, string>;

export function kvToMap(list: WbKv[], includeDisabled = false): VariableMap {
  const out: VariableMap = {};
  for (const item of list) {
    if (!includeDisabled && !item.enabled) {
      continue;
    }
    if (!item.key) {
      continue;
    }
    out[item.key] = item.value;
  }
  return out;
}

/** Later layers override earlier ones. Typical order: globals, collection, environment, data, local. */
export function mergeVariableLayers(layers: Array<WbKv[] | VariableMap | undefined | null>): VariableMap {
  const out: VariableMap = {};
  for (const layer of layers) {
    if (!layer) {
      continue;
    }
    const map = Array.isArray(layer) ? kvToMap(layer) : layer;
    Object.assign(out, map);
  }
  return out;
}

function randomInt(min: number, max: number): string {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
}

const DYNAMIC: Record<string, () => string> = {
  guid: () => crypto.randomUUID(),
  timestamp: () => String(Math.floor(Date.now() / 1000)),
  isoTimestamp: () => new Date().toISOString(),
  randomInt: () => randomInt(0, 1000),
  randomUUID: () => crypto.randomUUID(),
};

const TOKEN = /\{\{\s*(\$?[\w.-]+)(?:\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\))?\s*\}\}/g;

export function interpolate(input: string, vars: VariableMap, now = Date.now()): string {
  if (!input || !input.includes("{{")) {
    return input;
  }
  let out = input;
  for (let i = 0; i < 8; i += 1) {
    const next = out.replace(TOKEN, (match, name: string, a?: string, b?: string) => {
      if (name.startsWith("$")) {
        const key = name.slice(1);
        if (key === "randomInt" && a != null && b != null) {
          return randomInt(Number(a), Number(b));
        }
        if (key === "timestamp") {
          return String(Math.floor(now / 1000));
        }
        if (key === "isoTimestamp") {
          return new Date(now).toISOString();
        }
        const fn = DYNAMIC[key];
        return fn ? fn() : match;
      }
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        return vars[name] ?? match;
      }
      return match;
    });
    if (next === out) {
      break;
    }
    out = next;
  }
  return out;
}

export function interpolateObject<T>(value: T, vars: VariableMap, now = Date.now()): T {
  if (typeof value === "string") {
    return interpolate(value, vars, now) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolateObject(item, vars, now)) as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = interpolateObject(item, vars, now);
    }
    return out as T;
  }
  return value;
}
