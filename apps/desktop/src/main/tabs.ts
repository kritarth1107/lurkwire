import { randomUUID } from "node:crypto";
import { BrowserWindow, clipboard, WebContentsView, session } from "electron";
import type { Bounds, ContextMenuPayload, FindResult, TabInfo } from "../shared/types";
import {
  canonicalizeInternalUrl,
  isInternalUrl,
  normalizeUrl,
  titleForInternalPage,
} from "../shared/url";
import { recordVisit } from "./visits";
import { configureProjectSession } from "./sessions";

type Tab = {
  id: string;
  projectId: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  favicon: string | null;
  pinned: boolean;
  view: WebContentsView;
};

export class TabManager {
  private tabs = new Map<string, Tab>();
  private order: string[] = [];
  private closed: { projectId: string; url: string; title: string }[] = [];
  private activeId: string | null = null;
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  private visible = true;
  private configured = new Set<string>();

  constructor(
    private window: BrowserWindow,
    private getProxy: () => { listen: string; fingerprint: string; caPath?: string } | null,
    private onChange: () => void,
    private onSession: (ses: Electron.Session) => void,
    private onContextMenu: (payload: ContextMenuPayload) => void,
    private onFind: (result: FindResult) => void,
  ) {}

  list(projectId: string): TabInfo[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((tab): tab is Tab => Boolean(tab && tab.projectId === projectId))
      .map((tab) => toInfo(tab));
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

  async create(projectId: string, url = "", opts?: { pinned?: boolean }): Promise<string> {
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
      title: url ? url : "New Tab",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      favicon: null,
      pinned: opts?.pinned ?? false,
      view,
    };
    this.bind(tab);
    this.tabs.set(id, tab);
    if (tab.pinned) {
      const firstUnpinned = this.order.findIndex((item) => !this.tabs.get(item)?.pinned);
      this.order.splice(firstUnpinned === -1 ? this.order.length : firstUnpinned, 0, id);
    } else {
      this.order.push(id);
    }
    this.window.contentView.addChildView(view);
    this.show(id);
    await this.navigate(id, url || "lurkwire://newtab");
    this.layout();
    this.onChange();
    return id;
  }

  close(id: string, projectId: string): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    if (tab.pinned) {
      return;
    }
    if (tab.url) {
      this.closed.push({ projectId: tab.projectId, url: tab.url, title: tab.title });
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

  closeOthers(id: string, projectId: string): void {
    for (const tab of this.list(projectId)) {
      if (tab.id !== id && !tab.pinned) {
        this.close(tab.id, projectId);
      }
    }
  }

  closeToRight(id: string, projectId: string): void {
    const listed = this.list(projectId);
    const index = listed.findIndex((tab) => tab.id === id);
    if (index < 0) {
      return;
    }
    for (const tab of listed.slice(index + 1)) {
      if (!tab.pinned) {
        this.close(tab.id, projectId);
      }
    }
  }

  async reopen(projectId: string): Promise<void> {
    for (let i = this.closed.length - 1; i >= 0; i -= 1) {
      const item = this.closed[i];
      if (item?.projectId === projectId) {
        this.closed.splice(i, 1);
        await this.create(projectId, item.url);
        return;
      }
    }
  }

  async duplicate(id: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    await this.create(tab.projectId, tab.url);
  }

  pin(id: string, pinned: boolean): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    tab.pinned = pinned;
    this.order = this.order.filter((item) => item !== id);
    if (pinned) {
      const firstUnpinned = this.order.findIndex((item) => !this.tabs.get(item)?.pinned);
      this.order.splice(firstUnpinned === -1 ? this.order.length : firstUnpinned, 0, id);
    } else {
      this.order.push(id);
    }
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

  contentBounds(): Bounds {
    return this.bounds;
  }

  async navigate(id: string, input: string): Promise<"internal" | "external"> {
    const tab = this.tabs.get(id);
    if (!tab) {
      return "external";
    }
    const raw = normalizeUrl(input) || "lurkwire://newtab";
    const url = canonicalizeInternalUrl(raw) ?? raw;
    const internal = isInternalUrl(url);
    await this.prepareSession(tab.projectId);
    tab.url = url;
    tab.title = internal ? titleForInternalPage(url) : tab.title || url;
    tab.loading = !internal;
    if (internal) {
      tab.favicon = null;
    }
    this.onChange();
    await tab.view.webContents.loadURL(url);
    return internal ? "internal" : "external";
  }

  back(): void {
    this.active()?.view.webContents.goBack();
  }

  forward(): void {
    this.active()?.view.webContents.goForward();
  }

  reload(ignoreCache = false): void {
    const wc = this.active()?.view.webContents;
    if (!wc) {
      return;
    }
    if (ignoreCache) {
      wc.reloadIgnoringCache();
    } else {
      wc.reload();
    }
  }

  stop(): void {
    this.active()?.view.webContents.stop();
  }

  openDevTools(): void {
    this.active()?.view.webContents.openDevTools({ mode: "detach" });
  }

  setZoom(factor: number): void {
    const wc = this.active()?.view.webContents;
    if (!wc) {
      return;
    }
    const next = Math.min(3, Math.max(0.5, factor));
    wc.setZoomFactor(next);
    this.onChange();
  }

  adjustZoom(delta: number): void {
    const current = this.active()?.view.webContents.getZoomFactor() ?? 1;
    this.setZoom(current + delta);
  }

  resetZoom(): void {
    this.setZoom(1);
  }

  find(text: string, options?: Electron.FindInPageOptions): void {
    const wc = this.active()?.view.webContents;
    if (!wc) {
      return;
    }
    if (!text) {
      wc.stopFindInPage("clearSelection");
      return;
    }
    wc.findInPage(text, options);
  }

  stopFind(): void {
    this.active()?.view.webContents.stopFindInPage("clearSelection");
  }

  hideProject(projectId: string): void {
    for (const tab of this.tabs.values()) {
      if (tab.projectId === projectId) {
        tab.view.setVisible(false);
      }
    }
  }

  execPageAction(action: string, url?: string): void {
    const wc = this.active()?.view.webContents;
    if (!wc) {
      return;
    }
    switch (action) {
      case "copy":
        wc.copy();
        break;
      case "cut":
        wc.cut();
        break;
      case "paste":
        wc.paste();
        break;
      case "selectAll":
        wc.selectAll();
        break;
      case "undo":
        wc.undo();
        break;
      case "redo":
        wc.redo();
        break;
      case "copyURL":
      case "copyLink":
        if (url) {
          clipboard.writeText(url);
        }
        break;
      default:
        break;
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
      if (isInternalUrl(tab.url)) {
        tab.title = titleForInternalPage(tab.url);
      } else {
        tab.title = title || tab.url || "New Tab";
      }
      this.onChange();
    });
    wc.on("page-favicon-updated", (_event, favicons) => {
      tab.favicon = favicons[0] ?? null;
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
      this.applyNavigated(tab, url);
    });
    wc.on("did-navigate-in-page", (_event, url) => {
      this.applyNavigated(tab, url, { inPage: true });
    });
    wc.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }
      tab.loading = false;
      tab.title = "Failed to load";
      tab.url = url;
      console.error(`tab load failed ${code} ${description} ${url}`);
      this.onChange();
    });
    wc.on("found-in-page", (_event, result) => {
      this.onFind({
        requestId: result.requestId,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate,
      });
    });
    wc.on("context-menu", (_event, params) => {
      const bounds = this.window.getContentBounds();
      this.onContextMenu({
        kind: "page",
        tabId: tab.id,
        x: bounds.x + params.x + this.bounds.x,
        y: bounds.y + params.y + this.bounds.y,
        linkURL: params.linkURL || undefined,
        srcURL: params.srcURL || undefined,
        pageURL: params.pageURL || undefined,
        selectionText: params.selectionText || undefined,
        canCopy: params.editFlags.canCopy,
        canPaste: params.editFlags.canPaste,
        canCut: params.editFlags.canCut,
        canUndo: params.editFlags.canUndo,
        canRedo: params.editFlags.canRedo,
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
        hasImage: Boolean(params.hasImageContents || params.srcURL),
        isEditable: params.isEditable,
      });
    });
  }

  private applyNavigated(tab: Tab, url: string, opts?: { inPage?: boolean }): void {
    const canonical = canonicalizeInternalUrl(url) ?? url;
    tab.url = canonical;
    if (isInternalUrl(canonical)) {
      tab.title = titleForInternalPage(canonical);
      tab.favicon = null;
      tab.loading = false;
    }
    tab.canGoBack = tab.view.webContents.canGoBack();
    tab.canGoForward = tab.view.webContents.canGoForward();
    if (!opts?.inPage && (canonical.startsWith("http://") || canonical.startsWith("https://"))) {
      recordVisit(canonical, tab.title);
    }
    this.onChange();
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
    await configureProjectSession(ses, proxy.listen, proxy.fingerprint, proxy.caPath);
    this.onSession(ses);
    this.configured.add(key);
  }
}

function isSecure(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "lurkwire:";
  } catch {
    return false;
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
    favicon: tab.favicon,
    pinned: tab.pinned,
    secure: isSecure(tab.url),
    zoomFactor: tab.view.webContents.isDestroyed() ? 1 : tab.view.webContents.getZoomFactor(),
  };
}

export { isNewTabUrl, isSettingsUrl } from "../shared/url";
