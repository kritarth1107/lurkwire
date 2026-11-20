import { randomUUID } from "node:crypto";
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, session as electronSession, shell } from "electron";
import { join } from "node:path";
import type {
  AppPrefs,
  AppSnapshot,
  Bounds,
  ChromePage,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  FindingQuery,
  IntruderStart,
  LlmRequest,
  NewScopeRule,
  PanelOpenRequest,
  RepeaterSendRequest,
  SidebarPanel,
  ToolId,
} from "../shared/types";
import { DEFAULT_PREFS, PRODUCT_NAME, PRODUCT_VERSION } from "../shared/types";
import { addBookmark, loadBookmarks, removeBookmark } from "./bookmarks";
import { ControlClient } from "./control";
import { DownloadManager } from "./downloads";
import { PanelManager } from "./panels";
import { loadPrefs, savePrefs } from "./prefs";
import { ProxySidecar } from "./proxy";
import { clearLlmKey, completeLlm, hasLlmKey, saveLlmKey } from "./llm";
import { clearShodanKey, hasShodanKey, runRecon, saveShodanKey } from "./recon";
import { isSmokeRun, isolateSmokeUserData, runSmoke } from "./smoke";
import { handleLurkwireProtocol, registerLurkwireScheme } from "./internal-protocol";
import { isSettingsUrl, TabManager } from "./tabs";
import {
  canonicalizeInternalUrl,
  isInternalUrl,
  type InternalPage,
} from "../shared/url";
import { collectSiteInfo } from "./siteInfo";
import { clearVisits, deleteVisit, listVisits } from "./visits";

app.setName(PRODUCT_NAME);
registerLurkwireScheme();
isolateSmokeUserData();
if (isSmokeRun()) {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("disable-gpu-sandbox");
}

type ChromeWin = {
  id: string;
  window: BrowserWindow;
  tabs: TabManager;
  panels: PanelManager;
  tool: ToolId;
  chromePage: ChromePage;
  privateMode: boolean;
};

const chromeWindows: ChromeWin[] = [];

let mainWindow: BrowserWindow | null = null;
let tabs: TabManager | null = null;
const sidecar = new ProxySidecar();
const control = new ControlClient(() => sidecar.ready);
const downloads = new DownloadManager(() => emitDownloads());

let prefs: AppPrefs = { ...DEFAULT_PREFS };
let bookmarks = loadBookmarksSafe();
let killed = false;
let currentProjectId: string | null = null;
let projects: AppSnapshot["projects"] = [];
let proxyStatus: AppSnapshot["proxy"] = { status: "starting" };
let lastError: string | null = null;

function loadBookmarksSafe() {
  try {
    return loadBookmarks();
  } catch {
    return [];
  }
}

function resolveTheme(): "light" | "dark" {
  if (prefs.theme === "system") {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  }
  return prefs.theme;
}

function liveWindows(): ChromeWin[] {
  return chromeWindows.filter((item) => !item.window.isDestroyed());
}

function chromeOfContents(contents: Electron.WebContents): ChromeWin | undefined {
  return liveWindows().find((item) => {
    if (item.window.webContents === contents) {
      return true;
    }
    if (item.panels.isPanel(contents)) {
      return true;
    }
    return item.tabs.hasWebContents(contents);
  });
}

function focusedChrome(): ChromeWin | undefined {
  return liveWindows().find((item) => item.window.isFocused()) ?? liveWindows()[0];
}

function activate(win: ChromeWin): void {
  mainWindow = win.window;
  tabs = win.tabs;
}

function ctx(event?: { sender: Electron.WebContents }): ChromeWin | undefined {
  if (event) {
    return chromeOfContents(event.sender) ?? focusedChrome();
  }
  return focusedChrome();
}

function applyTheme(): void {
  nativeTheme.themeSource = prefs.theme;
  const dark = resolveTheme() === "dark";
  const background = dark ? "#1c1b22" : "#f0f0f4";
  for (const win of liveWindows()) {
    win.window.setBackgroundColor(background);
  }
  emit();
}

function snapshot(win: ChromeWin): AppSnapshot {
  const active = win.tabs.activeInfo();
  return {
    product: PRODUCT_NAME,
    version: PRODUCT_VERSION,
    proxy: proxyStatus,
    projects,
    currentProjectId,
    tabs: currentProjectId ? win.tabs.list(currentProjectId) : [],
    activeTabId: active?.id ?? null,
    tool: win.tool,
    error: lastError,
    prefs,
    killed,
    chromePage: win.chromePage,
    zoomFactor: active?.zoomFactor ?? 1,
    theme: resolveTheme(),
    maximized: win.window.isMaximized(),
    privateMode: win.privateMode,
  };
}

function emit(target?: ChromeWin): void {
  const list = target ? [target] : liveWindows();
  for (const win of list) {
    if (win.window.webContents.isDestroyed()) {
      continue;
    }
    const snap = snapshot(win);
    win.window.webContents.send("lurkwire:state", snap);
    win.panels.send("lurkwire:state", snap);
  }
}

function emitDownloads(): void {
  const list = downloads.list();
  for (const win of liveWindows()) {
    win.window.webContents.send("lurkwire:downloads", list);
    win.panels.send("lurkwire:downloads", list);
  }
}

function emitBookmarks(): void {
  for (const win of liveWindows()) {
    win.window.webContents.send("lurkwire:bookmarks", bookmarks);
    win.panels.send("lurkwire:bookmarks", bookmarks);
  }
}

function emitFind(result: unknown, win?: ChromeWin): void {
  const target = win ?? focusedChrome();
  target?.window.webContents.send("lurkwire:find", result);
}

function setChromePage(win: ChromeWin, next: ChromePage): void {
  win.chromePage = next;
  if (next === "settings") {
    win.tool = "settings";
  } else if (win.tool === "settings") {
    win.tool = "browser";
  }
  syncViewVisibility(win);
  emit(win);
}

function syncViewVisibility(target?: ChromeWin): void {
  const list = target ? [target] : liveWindows();
  for (const win of list) {
    const active = win.tabs.activeInfo();
    const showPage = !killed && Boolean(active?.url) && !isInternalUrl(active?.url ?? "");
    win.tabs.setVisible(showPage);
  }
}

function selectTool(next: ToolId, win = focusedChrome()): void {
  if (!win) {
    return;
  }
  win.tool = next;
  if (next === "settings") {
    void openInternalPage("settings", win);
    return;
  }
  if (next === "browser") {
    prefs = { ...prefs, sidebarOpen: false };
    savePrefs(prefs);
    setChromePage(win, "content");
    return;
  }
  prefs = {
    ...prefs,
    sidebarOpen: true,
    sidebarPanel: next as SidebarPanel,
  };
  savePrefs(prefs);
  setChromePage(win, "content");
}

async function refreshProjects(): Promise<void> {
  projects = await control.listProjects();
  if (!currentProjectId || !projects.some((project) => project.id === currentProjectId)) {
    currentProjectId = projects[0]?.id ?? sidecar.ready?.default_project_id ?? null;
  }
}

async function applyProxyReady(): Promise<void> {
  const ready = sidecar.ready;
  if (!ready) {
    return;
  }
  proxyStatus = {
    status: "ready",
    listen: ready.proxy_listen,
    control: ready.control_listen,
    caPath: ready.ca_path,
    fingerprint: ready.ca_fingerprint_sha256,
  };
  lastError = null;
  await refreshProjects();
  if (currentProjectId) {
    for (const win of liveWindows()) {
      await win.tabs.ensureTab(currentProjectId);
    }
  }
  try {
    killed = (await control.getKill()).killed;
    if (killed) {
      lastError = "Kill switch is on. Traffic is blocked.";
    }
  } catch {
    // keep local value if the control call fails
  }
  syncViewVisibility();
  emit();
}

function createWindow(options?: { privateMode?: boolean }): ChromeWin {
  const privateMode = options?.privateMode ?? false;
  const dark = resolveTheme() === "dark";
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: PRODUCT_NAME,
    icon: join(__dirname, "../../build/icon.png"),
    backgroundColor: dark ? "#1c1b22" : "#f0f0f4",
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.setTitle(privateMode ? `${PRODUCT_NAME} (Private)` : PRODUCT_NAME);

  const win: ChromeWin = {
    id: randomUUID(),
    window,
    tabs: null as unknown as TabManager,
    panels: new PanelManager(
      () => window,
      () => (resolveTheme() === "dark" ? "#2b2a33" : "#f9f9fb"),
    ),
    tool: "browser",
    chromePage: "content",
    privateMode,
  };

  win.tabs = new TabManager(
    window,
    () =>
      sidecar.ready
        ? {
            listen: sidecar.ready.proxy_listen,
            fingerprint: sidecar.ready.ca_fingerprint_sha256,
            caPath: sidecar.ready.ca_path,
          }
        : null,
    () => {
      const active = win.tabs.activeInfo();
      if (active && isSettingsUrl(active.url)) {
        win.chromePage = "settings";
        win.tool = "settings";
      } else if (win.chromePage === "settings" && active && !isSettingsUrl(active.url)) {
        win.chromePage = "content";
        if (win.tool === "settings") {
          win.tool = "browser";
        }
      }
      syncViewVisibility(win);
      emit(win);
    },
    (ses) => downloads.hook(ses),
    (payload) => {
      void win.panels.open({
        kind: "pagemenu",
        x: payload.x,
        y: payload.y,
        width: 240,
        height: 360,
        payload: payload as unknown as Record<string, unknown>,
      });
    },
    (result) => emitFind(result, win),
    privateMode
      ? { privateMode: true, privatePartition: `temp:incognito-${win.id}` }
      : undefined,
  );

  chromeWindows.push(win);
  activate(win);

  window.on("ready-to-show", () => {
    if (isSmokeRun()) {
      window.setPosition(60, 60);
    }
    window.show();
  });
  window.on("focus", () => activate(win));
  window.on("maximize", () => emit(win));
  window.on("unmaximize", () => emit(win));
  window.on("closed", () => {
    const index = chromeWindows.findIndex((item) => item.id === win.id);
    if (index >= 0) {
      chromeWindows.splice(index, 1);
    }
    win.panels.close();
    if (mainWindow === window) {
      const next = focusedChrome();
      mainWindow = next?.window ?? null;
      tabs = next?.tabs ?? null;
    }
  });

  window.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith("http://") || details.url.startsWith("https://")) {
      void openNewTab(details.url, win);
      return { action: "deny" };
    }
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  hookShortcuts(win);
  if (isSmokeRun()) {
    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      console.log(`SMOKE render[${level}] ${message} (${sourceId}:${line})`);
    });
    window.webContents.on("did-fail-load", (_event, code, desc, url) => {
      console.log(`SMOKE did-fail-load ${code} ${desc} ${url}`);
    });
    window.webContents.on("preload-error", (_event, path, error) => {
      console.log(`SMOKE preload-error ${path} ${error}`);
    });
    window.webContents.on("did-finish-load", () => {
      console.log("SMOKE chrome did-finish-load");
    });
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (currentProjectId && proxyStatus.status === "ready") {
    void win.tabs.ensureTab(currentProjectId);
  }
  return win;
}

function hookShortcuts(win: ChromeWin): void {
  win.window.webContents.on("before-input-event", (event, input) => {
    if (handleShortcut(input, win, win.window.webContents)) {
      event.preventDefault();
    }
  });
}

function handleShortcut(input: Electron.Input, win: ChromeWin, contents: Electron.WebContents): boolean {
  if (input.type !== "keyDown") {
    return false;
  }
  const ctrl = input.control || input.meta;
  const shift = input.shift;
  const alt = input.alt;
  const key = input.key.toLowerCase();
  const digit = key.length === 1 && key >= "1" && key <= "9" ? Number(key) : 0;

  if (ctrl && shift && key === "n") {
    openNewWindow({ privateMode: true });
    return true;
  }
  if (ctrl && key === "n") {
    openNewWindow();
    return true;
  }
  if (ctrl && shift && key === "t") {
    if (currentProjectId) {
      void win.tabs.reopen(currentProjectId);
    }
    return true;
  }
  if (ctrl && key === "t") {
    void openNewTab(undefined, win);
    return true;
  }
  if (ctrl && key === "w") {
    const id = win.tabs.activeInfo()?.id;
    if (id && currentProjectId) {
      win.tabs.close(id, currentProjectId);
      emit(win);
    }
    return true;
  }
  if (ctrl && key === "tab") {
    if (currentProjectId) {
      win.tabs.cycle(currentProjectId, shift ? -1 : 1);
    }
    return true;
  }
  if (ctrl && digit >= 1) {
    if (currentProjectId) {
      win.tabs.selectByNumber(currentProjectId, digit);
    }
    return true;
  }
  if ((ctrl && key === "l") || key === "f6") {
    win.window.webContents.send("lurkwire:focus-url");
    win.window.webContents.focus();
    return true;
  }
  if ((ctrl && key === "f") || key === "f3") {
    win.window.webContents.send("lurkwire:open-find");
    win.window.webContents.focus();
    return true;
  }
  if (ctrl && key === "r") {
    if (!killed) {
      win.tabs.reload(shift);
    }
    return true;
  }
  if (key === "f5") {
    win.tabs.reload(shift);
    return true;
  }
  if (ctrl && key === "d") {
    const active = win.tabs.activeInfo();
    if (active?.url && !isInternalUrl(active.url)) {
      bookmarks = addBookmark({ title: active.title || active.url, url: active.url }, bookmarks);
      emitBookmarks();
    }
    return true;
  }
  if (ctrl && key === "h") {
    void openInternalPage("history", win);
    return true;
  }
  if (ctrl && key === "j") {
    void openInternalPage("downloads", win);
    return true;
  }
  if (ctrl && shift && key === "b") {
    prefs = { ...prefs, bookmarksBar: !prefs.bookmarksBar };
    savePrefs(prefs);
    emit();
    return true;
  }
  if (ctrl && key === "b" && !shift) {
    // Chrome uses Ctrl+Shift+B for the bar; leave Ctrl+B unused so we do not
    // clash with page bold in editable fields beyond this return.
    return false;
  }
  if (ctrl && shift && key === "o") {
    void openInternalPage("bookmarks", win);
    return true;
  }
  if (ctrl && key === "p") {
    win.tabs.active()?.view.webContents.print({});
    return true;
  }
  if (ctrl && key === "s") {
    void saveActivePage(win);
    return true;
  }
  if (ctrl && key === "u") {
    const url = win.tabs.activeInfo()?.url;
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      void win.tabs.navigate(win.tabs.activeInfo()!.id, `view-source:${url}`);
    }
    return true;
  }
  if (ctrl && (key === "+" || key === "=")) {
    win.tabs.adjustZoom(0.1);
    return true;
  }
  if (ctrl && key === "-") {
    win.tabs.adjustZoom(-0.1);
    return true;
  }
  if (ctrl && key === "0") {
    win.tabs.resetZoom();
    return true;
  }
  if (key === "f11") {
    win.window.setFullScreen(!win.window.isFullScreen());
    return true;
  }
  if ((ctrl && shift && key === "i") || key === "f12") {
    if (contents === win.window.webContents) {
      win.window.webContents.openDevTools({ mode: "detach" });
    } else {
      win.tabs.openDevTools("detach");
    }
    return true;
  }
  if (ctrl && shift && key === "j") {
    win.tabs.openDevTools("detach");
    return true;
  }
  if (ctrl && shift && key === "c") {
    const wc = win.tabs.active()?.view.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.openDevTools({ mode: "right" });
    }
    return true;
  }
  if (ctrl && shift && key === "delete") {
    void clearBrowsingData(win);
    return true;
  }
  if (ctrl && key === ",") {
    void openInternalPage("settings", win);
    return true;
  }
  if (ctrl && key === "q") {
    app.quit();
    return true;
  }
  if (alt && key === "arrowleft") {
    if (!killed) {
      win.tabs.back();
    }
    return true;
  }
  if (alt && key === "arrowright") {
    if (!killed) {
      win.tabs.forward();
    }
    return true;
  }
  if (key === "escape") {
    win.window.webContents.send("lurkwire:escape");
    win.panels.close();
    if (win.window.isFullScreen()) {
      win.window.setFullScreen(false);
    }
    return false;
  }
  void contents;
  return false;
}

async function saveActivePage(win: ChromeWin): Promise<void> {
  const tab = win.tabs.active();
  if (!tab || tab.view.webContents.isDestroyed()) {
    return;
  }
  const suggested = `${(tab.title || "page").replace(/[^\w.-]+/g, " ").trim() || "page"}.html`;
  const choice = await dialog.showSaveDialog(win.window, {
    title: "Save page",
    defaultPath: suggested,
    filters: [
      { name: "Web page, complete", extensions: ["html"] },
      { name: "HTML only", extensions: ["html"] },
    ],
  });
  if (choice.canceled || !choice.filePath) {
    return;
  }
  await tab.view.webContents.savePage(choice.filePath, "HTMLComplete");
}

async function clearBrowsingData(win: ChromeWin): Promise<void> {
  const result = await dialog.showMessageBox(win.window, {
    type: "warning",
    buttons: ["Clear", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    title: "Clear browsing data",
    message: "Clear browsing history, cache, and site data for this profile?",
    detail: "Captured proxy flows are not deleted. Private windows already use a temporary session.",
  });
  if (result.response !== 0) {
    return;
  }
  clearVisits();
  const ses = currentProjectId
    ? electronSession.fromPartition(win.privateMode ? `temp:incognito-${win.id}` : `persist:proj-${currentProjectId}`)
    : electronSession.defaultSession;
  await ses.clearCache();
  await ses.clearStorageData();
  emit();
}

async function openInternalPage(page: InternalPage, win = focusedChrome()): Promise<void> {
  if (!currentProjectId || !win) {
    return;
  }
  const url = `lurkwire://${page}`;
  const active = win.tabs.activeInfo();
  if (active) {
    await win.tabs.navigate(active.id, url);
  } else {
    await win.tabs.create(currentProjectId, url);
  }
  win.tool = page === "settings" ? "settings" : "browser";
  win.chromePage = page === "settings" ? "settings" : "content";
  syncViewVisibility(win);
  emit(win);
}

async function openNewTab(url?: string, win = focusedChrome()): Promise<void> {
  if (!currentProjectId || !win) {
    throw new Error("No project is selected");
  }
  const target = url ? (canonicalizeInternalUrl(url) ?? url) : "lurkwire://newtab";
  if (killed && !isInternalUrl(target)) {
    lastError = "Kill switch is on. Traffic is blocked.";
    emit();
    return;
  }
  await win.tabs.create(currentProjectId, target);
  win.tool = "browser";
  win.chromePage = "content";
  syncViewVisibility(win);
  emit(win);
}

function openNewWindow(options?: { privateMode?: boolean }): ChromeWin {
  return createWindow(options);
}

function registerIpc(): void {
  ipcMain.handle("lurkwire:getState", (event) => {
    const win = ctx(event);
    return win ? snapshot(win) : null;
  });
  ipcMain.handle("lurkwire:newTab", (event, url?: string) => openNewTab(url, ctx(event)));
  ipcMain.handle("lurkwire:newWindow", (_event, opts?: { privateMode?: boolean }) => {
    openNewWindow(opts);
  });
  ipcMain.handle("lurkwire:moveTab", (event, id: string, beforeId: string | null) => {
    const win = ctx(event);
    win?.tabs.move(id, beforeId);
    if (win) {
      emit(win);
    }
  });
  ipcMain.handle("lurkwire:closeTab", (event, id: string) => {
    const win = ctx(event);
    if (!currentProjectId || !win) {
      return;
    }
    win.tabs.close(id, currentProjectId);
    emit(win);
  });
  ipcMain.handle("lurkwire:switchTab", (event, id: string) => {
    const win = ctx(event);
    if (!win) {
      return;
    }
    win.tabs.show(id);
    const info = win.tabs.activeInfo();
    win.chromePage = info && isSettingsUrl(info.url) ? "settings" : "content";
    win.tool = win.chromePage === "settings" ? "settings" : "browser";
    syncViewVisibility(win);
    emit(win);
  });
  ipcMain.handle("lurkwire:navigate", async (event, url: string) => {
    const win = ctx(event);
    const target = canonicalizeInternalUrl(url) ?? url;
    if (killed && !isInternalUrl(target)) {
      lastError = "Kill switch is on. Traffic is blocked.";
      emit();
      return;
    }
    const id = win?.tabs.activeInfo()?.id;
    if (!id || !win) {
      return;
    }
    const kind = await win.tabs.navigate(id, url);
    win.tool = kind === "internal" && isSettingsUrl(target) ? "settings" : "browser";
    win.chromePage = win.tool === "settings" ? "settings" : "content";
    syncViewVisibility(win);
    emit(win);
  });
  ipcMain.handle("lurkwire:back", (event) => {
    if (!killed) {
      ctx(event)?.tabs.back();
    }
  });
  ipcMain.handle("lurkwire:forward", (event) => {
    if (!killed) {
      ctx(event)?.tabs.forward();
    }
  });
  ipcMain.handle("lurkwire:reload", (event) => {
    if (!killed) {
      ctx(event)?.tabs.reload();
    }
  });
  ipcMain.handle("lurkwire:stop", (event) => ctx(event)?.tabs.stop());
  ipcMain.handle("lurkwire:openDevTools", (event, mode?: Electron.OpenDevToolsOptions["mode"]) =>
    ctx(event)?.tabs.openDevTools(mode ?? "detach"),
  );
  ipcMain.handle("lurkwire:inspectElement", (event, x: number, y: number) => ctx(event)?.tabs.inspectElement(x, y));
  ipcMain.handle("lurkwire:setTool", (event, next: ToolId) => {
    selectTool(next, ctx(event));
  });
  ipcMain.handle("lurkwire:setProject", async (event, id: string) => {
    const win = ctx(event);
    if (!win) {
      return;
    }
    if (currentProjectId) {
      for (const item of liveWindows()) {
        item.tabs.hideProject(currentProjectId);
      }
    }
    currentProjectId = id;
    await win.tabs.ensureTab(id);
    syncViewVisibility();
    emit();
  });
  ipcMain.handle("lurkwire:createProject", async (event, name: string) => {
    const project = await control.createProject(name);
    await refreshProjects();
    currentProjectId = project.id;
    const win = ctx(event);
    if (win) {
      await win.tabs.ensureTab(project.id);
    }
    emit();
    return project;
  });
  ipcMain.handle("lurkwire:reportBounds", (event, bounds: Bounds) => {
    const win = ctx(event);
    win?.tabs.setBounds(bounds);
    if (win) {
      syncViewVisibility(win);
    }
  });
  ipcMain.handle("lurkwire:listFlows", (_event, query: FlowQuery) => {
    return control.listFlows({
      ...query,
      project_id: query.project_id ?? currentProjectId ?? undefined,
    });
  });
  ipcMain.handle("lurkwire:getFlow", (_event, id: string) => control.getFlow(id));
  ipcMain.handle("lurkwire:getFlowBody", async (_event, id: string, which: "req" | "resp") => {
    const buf = await control.getFlowBody(id, which);
    return Buffer.from(buf).toString("base64");
  });
  ipcMain.handle("lurkwire:patchFlow", (_event, id: string, patch: { note?: string; tags?: string[] }) =>
    control.patchFlow(id, patch),
  );
  ipcMain.handle("lurkwire:sendRepeater", (_event, req: RepeaterSendRequest) =>
    control.sendRepeater({
      ...req,
      project_id: req.project_id ?? currentProjectId ?? undefined,
    }),
  );
  ipcMain.handle("lurkwire:getIntercept", () => control.getIntercept());
  ipcMain.handle("lurkwire:setIntercept", (_event, config: InterceptConfig) =>
    control.setIntercept(config),
  );
  ipcMain.handle("lurkwire:forwardIntercept", (_event, id: string, edit: ForwardEdit) =>
    control.forwardIntercept(id, edit),
  );
  ipcMain.handle("lurkwire:dropIntercept", (_event, id: string) => control.dropIntercept(id));

  ipcMain.handle("lurkwire:getPrefs", () => prefs);
  ipcMain.handle("lurkwire:setPrefs", (_event, patch: Partial<AppPrefs>) => {
    prefs = { ...prefs, ...patch };
    savePrefs(prefs);
    applyTheme();
    syncViewVisibility();
    emit();
    return prefs;
  });
  ipcMain.handle("lurkwire:setKillSwitch", async (_event, next: boolean) => {
    try {
      const state = next ? await control.engageKill() : await control.resumeKill();
      killed = state.killed;
      lastError = killed ? "Kill switch is on. Traffic is blocked." : null;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    syncViewVisibility();
    emit();
  });
  ipcMain.handle("lurkwire:listScope", (_event, projectId?: string) => control.listScope(projectId));
  ipcMain.handle("lurkwire:addScope", (_event, rule: NewScopeRule) => control.addScope(rule));
  ipcMain.handle("lurkwire:deleteScope", (_event, id: string) => control.deleteScope(id));
  ipcMain.handle("lurkwire:listAudit", (_event, projectId?: string) => control.listAudit(projectId));
  ipcMain.handle("lurkwire:hasLlmKey", () => hasLlmKey());
  ipcMain.handle("lurkwire:setLlmKey", (_event, key: string) => {
    saveLlmKey(key);
    return hasLlmKey();
  });
  ipcMain.handle("lurkwire:clearLlmKey", () => {
    clearLlmKey();
  });
  ipcMain.handle("lurkwire:llmComplete", async (_event, request: LlmRequest) => {
    return completeLlm(prefs.llm, request, (id) => control.getFlow(id));
  });
  ipcMain.handle("lurkwire:startIntruder", (_event, req: IntruderStart) =>
    control.startIntruder({
      ...req,
      project_id: req.project_id ?? currentProjectId ?? undefined,
    }),
  );
  ipcMain.handle("lurkwire:getIntruder", (_event, id: string) => control.getIntruder(id));
  ipcMain.handle("lurkwire:listIntruder", () => control.listIntruder());
  ipcMain.handle("lurkwire:stopIntruder", (_event, id: string) => control.stopIntruder(id));
  ipcMain.handle("lurkwire:listFindings", (_event, query: FindingQuery) =>
    control.listFindings({
      ...query,
      project_id: query.project_id ?? currentProjectId ?? undefined,
    }),
  );
  ipcMain.handle("lurkwire:getFinding", (_event, id: string) => control.getFinding(id));
  ipcMain.handle("lurkwire:getSiteInfo", async (event, url: string) => {
    const win = ctx(event);
    const partition = win?.privateMode
      ? `temp:incognito-${win.id}`
      : currentProjectId
        ? `persist:proj-${currentProjectId}`
        : undefined;
    const ses = partition ? electronSession.fromPartition(partition) : electronSession.defaultSession;
    return collectSiteInfo(url, {
      session: ses,
      listFlows: (host) =>
        control.listFlows({
          project_id: currentProjectId ?? undefined,
          host,
          limit: 20,
        }),
      getFlow: (id) => control.getFlow(id),
    });
  });
  ipcMain.handle("lurkwire:listVisits", (_event, query?: string) => listVisits(query));
  ipcMain.handle("lurkwire:deleteVisit", (_event, id: string) => deleteVisit(id));
  ipcMain.handle("lurkwire:clearVisits", () => {
    clearVisits();
  });
  ipcMain.handle("lurkwire:runRecon", (_event, request: { domain: string; sources?: string[] }) =>
    runRecon(request as Parameters<typeof runRecon>[0]),
  );
  ipcMain.handle("lurkwire:hasShodanKey", () => hasShodanKey());
  ipcMain.handle("lurkwire:setShodanKey", (_event, key: string) => {
    saveShodanKey(key);
    return hasShodanKey();
  });
  ipcMain.handle("lurkwire:clearShodanKey", () => {
    clearShodanKey();
  });
  ipcMain.handle("lurkwire:windowMinimize", (event) => ctx(event)?.window.minimize());
  ipcMain.handle("lurkwire:windowToggleMaximize", (event) => {
    const window = ctx(event)?.window;
    if (!window) {
      return;
    }
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  });
  ipcMain.handle("lurkwire:windowClose", (event) => ctx(event)?.window.close());
  ipcMain.handle("lurkwire:getBookmarks", () => bookmarks);
  ipcMain.handle("lurkwire:addBookmark", (_event, input: { title: string; url: string }) => {
    bookmarks = addBookmark(input, bookmarks);
    emitBookmarks();
    return bookmarks;
  });
  ipcMain.handle("lurkwire:removeBookmark", (_event, id: string) => {
    bookmarks = removeBookmark(id, bookmarks);
    emitBookmarks();
    return bookmarks;
  });
  ipcMain.handle("lurkwire:listDownloads", () => downloads.list());
  ipcMain.handle("lurkwire:cancelDownload", (_event, id: string) => downloads.cancel(id));
  ipcMain.handle("lurkwire:showDownload", (_event, id: string) => downloads.show(id));
  ipcMain.handle("lurkwire:openDownload", (_event, id: string) => downloads.open(id));
  ipcMain.handle("lurkwire:findInPage", (event, text: string, options?: Electron.FindInPageOptions) => {
    ctx(event)?.tabs.find(text, options);
  });
  ipcMain.handle("lurkwire:stopFindInPage", (event) => ctx(event)?.tabs.stopFind());
  ipcMain.handle("lurkwire:setZoom", (event, factor: number) => ctx(event)?.tabs.setZoom(factor));
  ipcMain.handle("lurkwire:adjustZoom", (event, delta: number) => ctx(event)?.tabs.adjustZoom(delta));
  ipcMain.handle("lurkwire:resetZoom", (event) => ctx(event)?.tabs.resetZoom());
  ipcMain.handle("lurkwire:pinTab", (event, id: string, pinned: boolean) => ctx(event)?.tabs.pin(id, pinned));
  ipcMain.handle("lurkwire:duplicateTab", (event, id: string) => ctx(event)?.tabs.duplicate(id));
  ipcMain.handle("lurkwire:closeOtherTabs", (event, id: string) => {
    const win = ctx(event);
    if (currentProjectId && win) {
      win.tabs.closeOthers(id, currentProjectId);
      emit(win);
    }
  });
  ipcMain.handle("lurkwire:closeTabsToRight", (event, id: string) => {
    const win = ctx(event);
    if (currentProjectId && win) {
      win.tabs.closeToRight(id, currentProjectId);
      emit(win);
    }
  });
  ipcMain.handle("lurkwire:reopenTab", (event) => {
    const win = ctx(event);
    if (currentProjectId && win) {
      return win.tabs.reopen(currentProjectId);
    }
    return undefined;
  });
  ipcMain.handle("lurkwire:pageAction", (event, action: string, url?: string) => {
    ctx(event)?.tabs.execPageAction(action, url);
  });
  ipcMain.handle("lurkwire:copyText", (_event, text: string) => clipboard.writeText(text));
  ipcMain.handle("lurkwire:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("lurkwire:openPanel", (event, request: PanelOpenRequest) => ctx(event)?.panels.open(request));
  ipcMain.handle("lurkwire:closePanel", (event) => ctx(event)?.panels.close());
  ipcMain.handle("lurkwire:resizePanel", (event, width: number, height: number) => {
    ctx(event)?.panels.resize(width, height);
  });
  ipcMain.handle("lurkwire:getPanelContext", (event) => ctx(event)?.panels.current() ?? null);
  ipcMain.handle("lurkwire:requestFind", (event) => {
    const win = ctx(event);
    if (!win) {
      return;
    }
    win.window.webContents.send("lurkwire:open-find");
    win.window.focus();
    win.window.webContents.focus();
  });
  ipcMain.handle("lurkwire:revealPath", (_event, filePath: string) => shell.showItemInFolder(filePath));
  ipcMain.handle("lurkwire:command", async (event, name: string) => {
    const win = ctx(event);
    if (!win) {
      return;
    }
    switch (name) {
      case "print":
        win.tabs.active()?.view.webContents.print({});
        break;
      case "save":
        await saveActivePage(win);
        break;
      case "viewSource": {
        const url = win.tabs.activeInfo()?.url;
        if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
          await win.tabs.navigate(win.tabs.activeInfo()!.id, `view-source:${url}`);
        }
        break;
      }
      case "fullscreen":
        win.window.setFullScreen(!win.window.isFullScreen());
        break;
      case "clearData":
        await clearBrowsingData(win);
        break;
      case "quit":
        app.quit();
        break;
      case "devtools":
        win.tabs.openDevTools("detach");
        break;
      case "console":
        win.tabs.openDevTools("detach");
        break;
      case "inspect":
        win.tabs.openDevTools("right");
        break;
      default:
        break;
    }
  });
}

function hookTabShortcuts(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("before-input-event", (event, input) => {
      const win = chromeOfContents(contents);
      if (!win || contents === win.window.webContents) {
        return;
      }
      if (handleShortcut(input, win, contents)) {
        event.preventDefault();
      }
    });
  });
}

hookTabShortcuts();

app.whenReady().then(async () => {
  handleLurkwireProtocol(electronSession.defaultSession);
  prefs = loadPrefs();
  bookmarks = loadBookmarksSafe();
  nativeTheme.themeSource = prefs.theme;
  registerIpc();
  createWindow();
  downloads.hook(electronSession.defaultSession);

  nativeTheme.on("updated", () => {
    applyTheme();
  });

  sidecar.on("down", () => {
    proxyStatus = {
      ...proxyStatus,
      status: "down",
    };
    lastError = "The intercepting proxy is down. Traffic is blocked until it restarts.";
    emit();
  });
  sidecar.on("ready", () => {
    void applyProxyReady();
  });

  try {
    await sidecar.start();
    await applyProxyReady();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    proxyStatus = { status: "down" };
    emit();
  }

  if (isSmokeRun()) {
    try {
      const paths = await runSmoke({
        window: () => mainWindow,
        tabs: () => tabs,
        control,
        proxyReady: () => proxyStatus.status === "ready",
        currentProjectId: () => currentProjectId,
        setPrefs: (patch) => {
          prefs = { ...prefs, ...patch };
          applyTheme();
          syncViewVisibility();
          emit();
        },
        selectTool,
        openNewTab,
      });
      console.log(`SMOKE ok ${paths.join(" ")}`);
      app.exit(0);
      return;
    } catch (err) {
      console.error("SMOKE failed:", err instanceof Error ? err.stack ?? err.message : err);
      app.exit(1);
      return;
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void sidecar.stop();
});
