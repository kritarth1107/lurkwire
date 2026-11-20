export const TAB_GROUP_COLORS = [
  "grey",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
] as const;

export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export const TAB_GROUP_COLOR_HEX: Record<TabGroupColor, string> = {
  grey: "#5f6368",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#188038",
  pink: "#d01884",
  purple: "#a142f4",
  cyan: "#007b83",
  orange: "#fa903e",
};

export type TabGroup = {
  id: string;
  title: string;
  color: TabGroupColor;
  collapsed: boolean;
};

export type GroupableTab = {
  id: string;
  groupId: string | null;
};

export type StripSegment =
  | { kind: "tabs"; tabs: GroupableTab[] }
  | { kind: "group"; group: TabGroup; tabs: GroupableTab[] };

export function nextTabGroupColor(existing: Iterable<TabGroupColor>): TabGroupColor {
  const used = new Set(existing);
  return TAB_GROUP_COLORS.find((color) => !used.has(color)) ?? TAB_GROUP_COLORS[used.size % TAB_GROUP_COLORS.length]!;
}

/** Keep each group's tabs contiguous, in the order the group first appears. */
export function packTabOrder(order: string[], groupIdOf: (id: string) => string | null): string[] {
  const members = new Map<string, string[]>();
  for (const id of order) {
    const groupId = groupIdOf(id);
    if (!groupId) {
      continue;
    }
    const list = members.get(groupId) ?? [];
    list.push(id);
    members.set(groupId, list);
  }
  const emitted = new Set<string>();
  const result: string[] = [];
  for (const id of order) {
    const groupId = groupIdOf(id);
    if (!groupId) {
      result.push(id);
      continue;
    }
    if (emitted.has(groupId)) {
      continue;
    }
    result.push(...(members.get(groupId) ?? [id]));
    emitted.add(groupId);
  }
  return result;
}

export function tabStripSegments<T extends GroupableTab>(tabs: T[], groups: TabGroup[]): Array<
  { kind: "tabs"; tabs: T[] } | { kind: "group"; group: TabGroup; tabs: T[] }
> {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const segments: Array<{ kind: "tabs"; tabs: T[] } | { kind: "group"; group: TabGroup; tabs: T[] }> = [];
  for (const tab of tabs) {
    const group = tab.groupId ? byId.get(tab.groupId) : undefined;
    const last = segments[segments.length - 1];
    if (!group) {
      if (last?.kind === "tabs") {
        last.tabs.push(tab);
      } else {
        segments.push({ kind: "tabs", tabs: [tab] });
      }
      continue;
    }
    if (last?.kind === "group" && last.group.id === group.id) {
      last.tabs.push(tab);
    } else {
      segments.push({ kind: "group", group, tabs: [tab] });
    }
  }
  return segments;
}

export function groupLabel(group: TabGroup): string {
  const title = group.title.trim();
  return title || "Group";
}
