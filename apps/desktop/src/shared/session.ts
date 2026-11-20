import type { TabGroup } from "./tabGroups";

export type SessionTab = {
  url: string;
  title: string;
  pinned: boolean;
  groupId: string | null;
};

export type SessionWindow = {
  tabs: SessionTab[];
  groups: TabGroup[];
  activeUrl: string | null;
};

export type SessionState = {
  windows: SessionWindow[];
};

export function hasRestorableTabs(session: SessionState | null | undefined): boolean {
  return Boolean(session?.windows.some((win) => win.tabs.some((tab) => Boolean(tab.url))));
}
