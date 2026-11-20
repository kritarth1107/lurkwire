import type { FlowSummary } from "./types";

export function sitemapToMarkdown(items: FlowSummary[]): string {
  const hosts = new Map<string, FlowSummary[]>();
  for (const item of items) {
    const list = hosts.get(item.host) ?? [];
    list.push(item);
    hosts.set(item.host, list);
  }
  const lines = ["# Sitemap", ""];
  const names = [...hosts.keys()].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    lines.push("No captured requests yet.");
    lines.push("");
    return lines.join("\n");
  }
  for (const host of names) {
    const list = hosts.get(host) ?? [];
    const seen = new Set<string>();
    const rows: string[] = [];
    const sorted = list.slice().sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    for (const item of sorted) {
      const path = `${item.path}${item.query ? `?${item.query}` : ""}`;
      const key = `${item.method} ${path}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      const status = item.status == null ? "-" : String(item.status);
      rows.push(`- ${item.method} ${path} (${status})`);
    }
    lines.push(`## ${host} (${rows.length})`);
    lines.push(...rows);
    lines.push("");
  }
  return lines.join("\n");
}
