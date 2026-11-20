/** Firefox-container-like palette used as a project color, not a brand asset. */
export const PROJECT_COLORS = [
  "#37adff",
  "#51cd00",
  "#ffcb00",
  "#ff9f00",
  "#ff4bda",
  "#9059ff",
  "#00c79a",
  "#ff4f5e",
] as const;

export function projectColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PROJECT_COLORS[hash % PROJECT_COLORS.length] ?? PROJECT_COLORS[0];
}
