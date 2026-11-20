import { randomUUID } from "node:crypto";
import { BrowserWindow, clipboard, WebContentsView, session } from "electron";
import type { Bounds, ContextMenuPayload, FindResult, TabGroup, TabGroupColor, TabInfo } from "../shared/types";
import { nextTabGroupColor, packTabOrder } from "../shared/tabGroups";
import type { SessionWindow } from "../shared/session";
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
  groupId: string | null;
  crashed: boolean;
  failed: boolean;
  audible: boolean;
  muted: boolean;
  view: WebContentsView;
};

export class TabManager {
  private tabs = new Map<string, Tab>();
  private groups = new Map<string, TabGroup>();
  private order: string[] = [];
  private closed: { projectId: string; url: string; title: string }[] = [];
  private activeId: string | null = null;
  private bounds: Bounds = { x: 0, y: 0, width: 0, height: 0 };
  private visible = true;
  private configured = new Set<string>();

  private privateMode = false;
  private privatePartition = "";

  constructor(
    private window: BrowserWindow,
    private getProxy: () => { listen: string; fingerprint: string; caPath?: string } | null,
    private onChange: () => void,
    private onSession: (ses: Electron.Session) => void,
    private onContextMenu: (payload: ContextMenuPayload) => void,
    private onFind: (result: FindResult) => void,
    options?: { privateMode?: boolean; privatePartition?: string },
  ) {
    this.privateMode = options?.privateMode ?? false;
    this.privatePartition = options?.privatePartition ?? "";
  }

  isPrivate(): boolean {
    return this.privateMode;
  }

  hasWebContents(contents: Electron.WebContents): boolean {
    for (const tab of this.tabs.values()) {
      if (!tab.view.webContents.isDestroyed() && tab.view.webContents === contents) {
        return true;
      }
    }
    return false;
  }

  cycle(projectId: string, delta: number): void {
    const listed = this.list(projectId);
    if (listed.length === 0) {
      return;
    }
    const index = listed.findIndex((tab) => tab.id === this.activeId);
    const next = listed[(index + delta + listed.length) % listed.length];
    if (next) {
      this.show(next.id);
    }
  }

  selectByNumber(projectId: string, number: number): void {
    const listed = this.list(projectId);
    if (listed.length === 0) {
      return;
    }
    const tab = number === 9 ? listed[listed.length - 1] : listed[number - 1];
    if (tab) {
      this.show(tab.id);
    }
  }

  move(id: string, beforeId: string | null): void {
    const tab = this.tabs.get(id);
    if (!tab || id === beforeId) {
      return;
    }
    const from = this.order.indexOf(id);
    if (from < 0) {
      return;
    }
    const target = beforeId ? this.tabs.get(beforeId) : null;
    if (target && target.pinned !== tab.pinned) {
      return;
    }
    if (!beforeId && tab.pinned) {
      return;
    }
    this.order.splice(from, 1);
    if (!beforeId) {
      this.order.push(id);
    } else {
      const to = this.order.indexOf(beforeId);
      this.order.splice(to < 0 ? this.order.length : to, 0, id);
    }
    if (tab.pinned) {
      tab.groupId = null;
    } else if (!beforeId) {
      tab.groupId = null;
    } else if (target) {
      tab.groupId = target.groupId;
    }
    this.packOrder();
    this.pruneGroups();
    this.onChange();
  }

  list(projectId: string): TabInfo[] {
    return this.order
      .map((id) => this.tabs.get(id))
      .filter((tab): tab is Tab => Boolean(tab && tab.projectId === projectId))
      .map((tab) => toInfo(tab));
  }


  serialize(): SessionWindow {
    const tabs = this.order
      .map((id) => this.tabs.get(id))
      .filter((tab): tab is Tab => Boolean(tab))
      .filter((tab) => Boolean(tab.url))
      .map((tab) => ({
        url: tab.url,
        title: tab.title,
        pinned: tab.pinned,
        groupId: tab.groupId,
      }));
    const used = new Set(tabs.map((tab) => tab.groupId).filter((id): id is string => Boolean(id)));
    return {
      tabs,
      groups: [...this.groups.values()].filter((group) => used.has(group.id)).map((group) => ({ ...group })),
      activeUrl: this.active()?.url ?? null,
    };
  }

  async restore(projectId: string, data: SessionWindow): Promise<void> {
    for (const group of data.groups) {
      this.groups.set(group.id, { ...group });
    }
    let firstId: string | null = null;
    let activeId: string | null = null;
    for (const tab of data.tabs) {
      if (!tab.url) {
        continue;
      }
      const id = await this.create(projectId, tab.url, {
        pinned: tab.pinned,
        groupId: tab.groupId ?? undefined,
        activate: false,
      });
      firstId ??= id;
      if (tab.url === data.activeUrl) {
        activeId = id;
      }
    }
    const showId = activeId ?? firstId;
    if (showId) {
      this.show(showId);
    } else {
      await this.ensureTab(projectId);
    }
    this.packOrder();
    this.onChange();
  }

  hasTabs(): boolean {
    return this.order.length > 0;
  }

  listGroups(projectId: string): TabGroup[] {
    const used = new Set(
      this.list(projectId)
        .map((tab) => tab.groupId)
        .filter((id): id is string => Boolean(id)),
    );
    return [...this.groups.values()].filter((group) => used.has(group.id));
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

  async create(projectId: string, url = "", opts?: { pinned?: boolean; groupId?: string; activate?: boolean }): Promise<string> {
    await this.prepareSession(projectId);
    const id = randomUUID();
    const view = new WebContentsView({
      webPreferences: {
        partition: this.partitionFor(projectId),
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
      groupId: opts?.pinned ? null : (opts?.groupId ?? null),
      crashed: false,
      failed: false,
      audible: false,
      muted: false,
      view,
    };
    this.bind(tab);
    this.tabs.set(id, tab);
    if (tab.pinned) {
      const firstUnpinned = this.order.findIndex((item) => !this.tabs.get(item)?.pinned);
      this.order.splice(firstUnpinned === -1 ? this.order.length : firstUnpinned, 0, id);
    } else if (tab.groupId) {
      const lastInGroup = [...this.order].reverse().find((item) => this.tabs.get(item)?.groupId === tab.groupId);
      if (lastInGroup) {
        const at = this.order.indexOf(lastInGroup);
        this.order.splice(at + 1, 0, id);
      } else {
        this.order.push(id);
      }
    } else {
      this.order.push(id);
    }
    this.window.contentView.addChildView(view);
    if (opts?.activate !== false) {
      this.show(id);
    } else {
      view.setVisible(false);
    }
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
    this.pruneGroups();
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
    await this.create(tab.projectId, tab.url, { groupId: tab.groupId ?? undefined });
  }

  pin(id: string, pinned: boolean): void {
    const tab = this.tabs.get(id);
    if (!tab) {
      return;
    }
    tab.pinned = pinned;
    if (pinned) {
      tab.groupId = null;
    }
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
    if (tab.groupId) {
      const group = this.groups.get(tab.groupId);
      if (group?.collapsed) {
        group.collapsed = false;
      }
    }
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


  createGroup(tabId: string): TabGroup | null {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.pinned) {
      return null;
    }
    const id = randomUUID();
    const group: TabGroup = {
      id,
      title: "",
      color: nextTabGroupColor([...this.groups.values()].map((item) => item.color)),
      collapsed: false,
    };
    this.groups.set(id, group);
    tab.groupId = id;
    this.packOrder();
    this.onChange();
    return group;
  }

  addToGroup(tabId: string, groupId: string): void {
    const tab = this.tabs.get(tabId);
    const group = this.groups.get(groupId);
    if (!tab || !group || tab.pinned) {
      return;
    }
    tab.groupId = groupId;
    this.packOrder();
    this.onChange();
  }

  ungroupTab(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) {
      return;
    }
    tab.groupId = null;
    this.pruneGroups();
    this.onChange();
  }

  updateGroup(id: string, patch: { title?: string; color?: TabGroupColor; collapsed?: boolean }): void {
    const group = this.groups.get(id);
    if (!group) {
      return;
    }
    if (patch.title !== undefined) {
      group.title = patch.title;
    }
    if (patch.color) {
      group.color = patch.color;
    }
    if (patch.collapsed !== undefined) {
      group.collapsed = patch.collapsed;
    }
    this.onChange();
  }

  ungroup(id: string): void {
    for (const tab of this.tabs.values()) {
      if (tab.groupId === id) {
        tab.groupId = null;
      }
    }
    this.groups.delete(id);
    this.onChange();
  }

  closeGroup(id: string, projectId: string): void {
    const members = this.list(projectId).filter((tab) => tab.groupId === id && !tab.pinned);
    for (const tab of members) {
      this.close(tab.id, projectId);
    }
    this.groups.delete(id);
    this.onChange();
  }

  private packOrder(): void {
    this.order = packTabOrder(this.order, (id) => this.tabs.get(id)?.groupId ?? null);
  }

  private pruneGroups(): void {
    const used = new Set(
      [...this.tabs.values()].map((tab) => tab.groupId).filter((id): id is string => Boolean(id)),
    );
    for (const id of [...this.groups.keys()]) {
      if (!used.has(id)) {
        this.groups.delete(id);
      }
    }
  }


  setMuted(id: string, muted: boolean): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) {
      return;
    }
    tab.view.webContents.setAudioMuted(muted);
    tab.muted = muted;
    this.onChange();
  }

  reloadTab(id: string, ignoreCache = false): void {
    const tab = this.tabs.get(id);
    if (!tab || tab.view.webContents.isDestroyed()) {
      return;
    }
    tab.crashed = false;
    tab.failed = false;
    if (ignoreCache) {
      tab.view.webContents.reloadIgnoringCache();
    } else {
      tab.view.webContents.reload();
    }
  }

  back(): void {
    this.active()?.view.webContents.navigationHistory.goBack();
  }

  forward(): void {
    this.active()?.view.webContents.navigationHistory.goForward();
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

  openDevTools(mode: Electron.OpenDevToolsOptions["mode"] = "detach"): void {
    this.active()?.view.webContents.openDevTools({ mode });
  }

  inspectElement(x: number, y: number): void {
    const wc = this.active()?.view.webContents;
    if (!wc || wc.isDestroyed()) {
      return;
    }
    wc.inspectElement(Math.round(x), Math.round(y));
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
      tab.failed = false;
      tab.crashed = false;
      this.onChange();
    });
    wc.on("did-stop-loading", () => {
      tab.loading = false;
      tab.canGoBack = wc.navigationHistory.canGoBack();
      tab.canGoForward = wc.navigationHistory.canGoForward();
      tab.audible = wc.isCurrentlyAudible();
      tab.muted = wc.isAudioMuted();
      this.onChange();
    });
    wc.on("audio-state-changed", () => {
      tab.audible = wc.isCurrentlyAudible();
      tab.muted = wc.isAudioMuted();
      this.onChange();
    });
    wc.on("media-started-playing", () => {
      tab.audible = true;
      this.onChange();
    });
    wc.on("media-paused", () => {
      tab.audible = wc.isCurrentlyAudible();
      this.onChange();
    });
    wc.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      tab.crashed = true;
      tab.loading = false;
      tab.title = tab.title || "Tab crashed";
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
      // Ignore aborted loads (user navigated away) and same-document cancels.
      if (code === -3) {
        tab.loading = false;
        this.onChange();
        return;
      }
      tab.loading = false;
      tab.failed = true;
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
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
        hasImage: Boolean(params.hasImageContents || params.srcURL),
        isEditable: params.isEditable,
        inspectX: params.x,
        inspectY: params.y,
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
    tab.canGoBack = tab.view.webContents.navigationHistory.canGoBack();
    tab.canGoForward = tab.view.webContents.navigationHistory.canGoForward();
    if (
      !this.privateMode &&
      !opts?.inPage &&
      (canonical.startsWith("http://") || canonical.startsWith("https://"))
    ) {
      recordVisit(canonical, tab.title);
    }
    this.onChange();
  }

  private partitionFor(projectId: string): string {
    if (this.privateMode && this.privatePartition) {
      return this.privatePartition;
    }
    return `persist:proj-${projectId}`;
  }

  private async prepareSession(projectId: string): Promise<void> {
    const proxy = this.getProxy();
    if (!proxy) {
      throw new Error("Proxy is down. Traffic is blocked until the sidecar comes back.");
    }
    const key = `${this.partitionFor(projectId)}:${proxy.listen}`;
    if (this.configured.has(key)) {
      return;
    }
    const ses = session.fromPartition(this.partitionFor(projectId));
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
    groupId: tab.groupId,
    secure: isSecure(tab.url),
    zoomFactor: tab.view.webContents.isDestroyed() ? 1 : tab.view.webContents.getZoomFactor(),
    crashed: tab.crashed,
    failed: tab.failed,
    audible: tab.audible,
    muted: tab.muted,
  };
}

export { isNewTabUrl, isSettingsUrl } from "../shared/url";
