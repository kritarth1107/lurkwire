import { randomUUID } from "node:crypto";
import { BrowserWindow, WebContentsView, session } from "electron";
import type { Bounds, TabInfo } from "../shared/types";
import { normalizeUrl } from "../shared/url";
import { configureProjectSession } from "./sessions";

type Tab = {
  id: string;
  projectId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  view: WebContentsView;
};

export class TabManager {
  private tabs = new Map<string, Tab>();
  private order: string[] = [];
  private activeId: string | null = null;
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  private visible = true;
  private configured = new Set<string>();

  constructor(
    private window: BrowserWindow,
    private getProxy: () => { listen: string; fingerprint: string } | null,
    private onChange: () => void,
  ) {}

  list(projectId: string): TabInfo[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((tab): tab is Tab => Boolean(tab && tab.projectId === projectId))
      .map(toInfo);
  }

  active(): Tab | null {
    return this.activeId ? this.tabs.get(this.activeId) ?? null : null;
  }

  activeInfo(): TabInfo | null {
    const tab = this.active();
    return tab ? toInfo(tab) : null;
  }

  async ensureTab(projectId: string): Promise<string> {
    const existing = this.list(projectId)[0];
    if (existing) {
      this.show(existing.id);
      return existing.id;
    }
    return this.create(projectId);
  }

  async create(projectId: string, url = ""): Promise<string> {
    await this.prepareSession(projectId);
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:proj-${projectId}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: true,
      },
    });
    const tab: Tab = {
      id,
      projectId,
      url,
      title: url ? url : "New tab",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      view,
    };
    this.bind(tab);
    this.tabs.set(id, tab);
    this.order.push(id);
    this.window.contentView.addChildView(view);
    this.show(id);
    if (url) {
      await this.navigate(id, url);
    }
    this.layout();
    this.onChange();
    return id;
  }

  close(id: string, projectId: string): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    this.window.contentView.removeChildView(tab.view);
    try {
      tab.view.webContents.close();
    } catch {
      // already destroyed
    }
    this.tabs.delete(id);
    this.order = this.order.filter((item) => item !== id);
    if (this.activeId === id) {
      const next = this.list(projectId).at(-1);
      this.activeId = next?.id ?? null;
      if (this.activeId) {
        this.show(this.activeId);
      }
    }
    this.layout();
    this.onChange();
  }

  show(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    this.activeId = id;
    for (const item of this.tabs.values()) {
      const isActive = item.id === id && this.visible;
      item.view.setVisible(isActive);
    }
    this.layout();
    this.onChange();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    const active = this.active();
    for (const tab of this.tabs.values()) {
      tab.view.setVisible(visible && active?.id === tab.id);
    }
    this.layout();
  }

  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
    this.layout();
  }

  async navigate(id: string, input: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    const url = normalizeUrl(input);
    if (!url) {
      return;
    }
    await this.prepareSession(tab.projectId);
    tab.url = url;
    tab.loading = true;
    this.onChange();
    await tab.view.webContents.loadURL(url);
  }

  back(): void {
    this.active()?.view.webContents.goBack();
  }

  forward(): void {
    this.active()?.view.webContents.goForward();
  }

  reload(): void {
    this.active()?.view.webContents.reload();
  }

  stop(): void {
    this.active()?.view.webContents.stop();
  }

  openDevTools(): void {
    this.active()?.view.webContents.openDevTools({ mode: "detach" });
  }

  hideProject(projectId: string): void {
    for (const tab of this.tabs.values()) {
      if (tab.projectId === projectId) {
        tab.view.setVisible(false);
      }
    }
  }

  private layout(): void {
    const active = this.active();
    if (!active || !this.visible) {
      return;
    }
    const { x, y, width, height } = this.bounds;
    if (width <= 0 || height <= 0) {
      return;
    }
    active.view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    });
  }

  private bind(tab: Tab): void {
    const wc = tab.view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      void this.create(tab.projectId, url);
      return { action: "deny" };
    });
    wc.on("page-title-updated", (_event, title) => {
      tab.title = title || tab.url || "New tab";
      this.onChange();
    });
    wc.on("did-start-loading", () => {
      tab.loading = true;
      this.onChange();
    });
    wc.on("did-stop-loading", () => {
      tab.loading = false;
      tab.canGoBack = wc.canGoBack();
      tab.canGoForward = wc.canGoForward();
      this.onChange();
    });
    wc.on("did-navigate", (_event, url) => {
      tab.url = url;
      tab.canGoBack = wc.canGoBack();
      tab.canGoForward = wc.canGoForward();
      this.onChange();
    });
    wc.on("did-navigate-in-page", (_event, url) => {
      tab.url = url;
      tab.canGoBack = wc.canGoBack();
      tab.canGoForward = wc.canGoForward();
      this.onChange();
    });
    wc.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      tab.loading = false;
      tab.title = `Failed to load`;
      tab.url = url;
      console.error(`tab load failed ${code} ${description} ${url}`);
      this.onChange();
    });
  }

  private async prepareSession(projectId: string): Promise<void> {
    const proxy = this.getProxy();
    if (!proxy) {
      throw new Error("Proxy is down. Traffic is blocked until the sidecar comes back.");
    }
    const key = `${projectId}:${proxy.listen}`;
    if (this.configured.has(key)) {
      return;
    }
    const ses = session.fromPartition(`persist:proj-${projectId}`);
    await configureProjectSession(ses, proxy.listen, proxy.fingerprint);
    this.configured.add(key);
  }
}

function toInfo(tab: Tab): TabInfo {
  return {
    id: tab.id,
    projectId: tab.projectId,
    title: tab.title,
    url: tab.url,
    loading: tab.loading,
    canGoBack: tab.canGoBack,
    canGoForward: tab.canGoForward,
  };
}
