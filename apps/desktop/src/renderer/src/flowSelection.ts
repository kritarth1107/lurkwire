import type { FlowDetail } from "../../shared/types";

let selected: FlowDetail | null = null;

export function setSelectedFlow(flow: FlowDetail | null): void {
  selected = flow;
}

export function getSelectedFlow(): FlowDetail | null {
  return selected;
}

export async function resolveCurrentFlow(tabUrl?: string | null): Promise<FlowDetail | null> {
  if (selected) {
    return selected;
  }
  const list = await window.lurkwire.listFlows({ limit: 80 });
  const items = list.items ?? [] as typeof list.items;
  if (!items.length) {
    return null;
  }
  let hit = items[0];
  if (tabUrl) {
    try {
      const parsed = new URL(tabUrl);
      const hostname = parsed.hostname;
      const pathname = parsed.pathname;
      hit =
        items.find((item: (typeof items)[number]) => item.url === tabUrl) ??
        items.find((item: (typeof items)[number]) => item.host === hostname && item.path === pathname) ??
        items.find((item: (typeof items)[number]) => item.host === hostname) ??
        items[0];
    } catch {
      /* keep latest */
    }
  }
  return window.lurkwire.getFlow(hit.id);
}
