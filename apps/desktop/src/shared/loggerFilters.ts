import type { FlowSummary } from "./types";
import { HIGHLIGHT_COLORS, type HighlightColor, highlightOf } from "./flowMeta";

export type LoggerFilter = {
  query: string;
  method: string;
  status: string;
  source: string;
  interestingOnly: boolean;
};

export type HighlightRule = {
  id: string;
  pattern: string;
  color: HighlightColor;
  enabled: boolean;
};

export const EMPTY_FILTER: LoggerFilter = {
  query: "",
  method: "",
  status: "",
  source: "",
  interestingOnly: false,
};

export function flowMatchesFilter(item: FlowSummary, filter: LoggerFilter): boolean {
  if (filter.method && item.method.toUpperCase() !== filter.method.toUpperCase()) {
    return false;
  }
  if (filter.source && item.source !== filter.source) {
    return false;
  }
  if (filter.status) {
    const status = String(item.status ?? "");
    if (filter.status.endsWith("xx") && filter.status.length === 3) {
      if (!status.startsWith(filter.status[0] ?? "")) {
        return false;
      }
    } else if (status !== filter.status) {
      return false;
    }
  }
  if (filter.interestingOnly) {
    const status = item.status ?? 0;
    const interesting = status >= 400 || status === 0 || item.method !== "GET" || (item.mime ?? "").includes("json");
    if (!interesting) {
      return false;
    }
  }
  const q = filter.query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const blob = `${item.method} ${item.status ?? ""} ${item.host}${item.path} ${item.query} ${item.source} ${(item.tags ?? []).join(" ")} ${item.note}`.toLowerCase();
  if (q.startsWith("/") && q.endsWith("/") && q.length > 2) {
    try {
      return new RegExp(q.slice(1, -1), "i").test(blob);
    } catch {
      return blob.includes(q);
    }
  }
  return blob.includes(q);
}

export function highlightForFlow(item: FlowSummary, rules: HighlightRule[]): HighlightColor | null {
  const tagged = highlightOf(item.tags);
  if (tagged) {
    return tagged;
  }
  const blob = `${item.method} ${item.status ?? ""} ${item.host}${item.path} ${item.query}`;
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern.trim()) {
      continue;
    }
    try {
      if (new RegExp(rule.pattern, "i").test(blob)) {
        return rule.color;
      }
    } catch {
      if (blob.toLowerCase().includes(rule.pattern.toLowerCase())) {
        return rule.color;
      }
    }
  }
  return null;
}

export { HIGHLIGHT_COLORS };
