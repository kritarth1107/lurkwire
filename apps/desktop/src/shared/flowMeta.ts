export const HIGHLIGHT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "magenta",
  "pink",
] as const;

export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export function highlightOf(tags: string[] | undefined | null): HighlightColor | null {
  const tag = (tags ?? []).find((item) => item.startsWith("hl:"));
  if (!tag) {
    return null;
  }
  const color = tag.slice(3);
  return (HIGHLIGHT_COLORS as readonly string[]).includes(color) ? (color as HighlightColor) : null;
}

export function setHighlight(tags: string[] | undefined | null, color: HighlightColor | null): string[] {
  const rest = (tags ?? []).filter((item) => !item.startsWith("hl:"));
  return color ? [...rest, `hl:${color}`] : rest;
}

export function flowTitle(path: string, host: string): string {
  const clean = path.split("?")[0];
  const segs = clean.split("/").filter(Boolean);
  return segs.at(-1) ?? host;
}

export function tlsLabel(scheme: string, version: string | null | undefined): string {
  const v = (version ?? "").trim();
  if (scheme === "https") {
    return v ? `TLS · ${v}` : "TLS";
  }
  return v || "HTTP";
}
