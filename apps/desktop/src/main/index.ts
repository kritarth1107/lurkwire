import { app, BrowserWindow, clipboard, ipcMain, nativeTheme, session as electronSession, shell } from "electron";
import { join } from "node:path";
import type {
  AppPrefs,
  AppSnapshot,
  Bounds,
  ChromePage,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
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
import { isNewTabUrl, isSettingsUrl, TabManager } from "./tabs";

app.setName(PRODUCT_NAME);

let mainWindow: BrowserWindow | null = null;
let tabs: TabManager | null = null;
const sidecar = new ProxySidecar();
const control = new ControlClient(() => sidecar.ready);
const downloads = new DownloadManager(() => emitDownloads());
const panels = new PanelManager(
  () => mainWindow,
  () => (resolveTheme() === "dark" ? "#2b2a33" : "#f9f9fb"),
);

let prefs: AppPrefs = { ...DEFAULT_PREFS };
let bookmarks = loadBookmarksSafe();
let tool: ToolId = "browser";
let chromePage: ChromePage = "content";
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

function applyTheme(): void {
  nativeTheme.themeSource = prefs.theme;
  const dark = resolveTheme() === "dark";
  mainWindow?.setBackgroundColor(dark ? "#1c1b22" : "#f0f0f4");
  emit();
}

function snapshot(): AppSnapshot {
  const active = tabs?.activeInfo() ?? null;
  return {
    product: PRODUCT_NAME,
    version: PRODUCT_VERSION,
    proxy: proxyStatus,
    projects,
    currentProjectId,
    tabs: currentProjectId && tabs ? tabs.list(currentProjectId) : [],
    activeTabId: active?.id ?? null,
    tool,
    error: lastError,
    prefs,
    killed,
    chromePage,
    zoomFactor: active?.zoomFactor ?? 1,
    theme: resolveTheme(),
    maximized: mainWindow?.isMaximized() ?? false,
  };
}

function emit(): void {
  const snap = snapshot();
  mainWindow?.webContents.send("lurkwire:state", snap);
  panels.send("lurkwire:state", snap);
}

function emitDownloads(): void {
  const list = downloads.list();
  mainWindow?.webContents.send("lurkwire:downloads", list);
  panels.send("lurkwire:downloads", list);
}

function emitBookmarks(): void {
  mainWindow?.webContents.send("lurkwire:bookmarks", bookmarks);
  panels.send("lurkwire:bookmarks", bookmarks);
}

function emitFind(result: unknown): void {
  mainWindow?.webContents.send("lurkwire:find", result);
}

function setChromePage(next: ChromePage): void {
  chromePage = next;
  if (next === "settings") {
    tool = "settings";
  } else if (tool === "settings") {
    tool = "browser";
  }
  syncViewVisibility();
  emit();
}

function syncViewVisibility(): void {
  const active = tabs?.activeInfo();
  const showPage =
    !killed &&
    chromePage === "content" &&
    Boolean(active?.url) &&
    !isNewTabUrl(active?.url ?? "") &&
    !isSettingsUrl(active?.url ?? "");
  tabs?.setVisible(showPage);
}

function selectTool(next: ToolId): void {
  tool = next;
  if (next === "settings") {
    setChromePage("settings");
    return;
  }
  if (next === "browser") {
    prefs = { ...prefs, sidebarOpen: false };
    savePrefs(prefs);
    setChromePage("content");
    return;
  }
  prefs = {
    ...prefs,
    sidebarOpen: true,
    sidebarPanel: next as SidebarPanel,
  };
  savePrefs(prefs);
  setChromePage("content");
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
  if (currentProjectId && tabs) {
    await tabs.ensureTab(currentProjectId);
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

function createWindow(): void {
  const dark = resolveTheme() === "dark";
  mainWindow = new BrowserWindow({
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
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("maximize", emit);
  mainWindow.on("unmaximize", emit);

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  tabs = new TabManager(
    mainWindow,
    () =>
      sidecar.ready
        ? {
            listen: sidecar.ready.proxy_listen,
            fingerprint: sidecar.ready.ca_fingerprint_sha256,
          }
        : null,
    () => {
      const active = tabs?.activeInfo();
      if (active && isSettingsUrl(active.url)) {
        chromePage = "settings";
      } else if (chromePage === "settings" && active && !isSettingsUrl(active.url)) {
        chromePage = "content";
      }
      syncViewVisibility();
      emit();
    },
    (ses) => downloads.hook(ses),
    (payload) => {
      void panels.open({
        kind: "pagemenu",
        x: payload.x,
        y: payload.y,
        width: 240,
        height: 360,
        payload: payload as unknown as Record<string, unknown>,
      });
    },
    emitFind,
  );

  hookShortcuts(mainWindow);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function hookShortcuts(window: BrowserWindow): void {
  const handle = (input: Electron.Input, contents: Electron.WebContents): boolean => {
    if (input.type !== "keyDown") {
      return false;
    }
    const ctrl = input.control || input.meta;
    const shift = input.shift;
    const key = input.key.toLowerCase();
    if (ctrl && key === "t") {
      void openNewTab();
      return true;
    }
    if (ctrl && shift && key === "t") {
      if (currentProjectId) {
        void tabs?.reopen(currentProjectId);
      }
      return true;
    }
    if (ctrl && key === "w") {
      const id = tabs?.activeInfo()?.id;
      if (id && currentProjectId) {
        tabs?.close(id, currentProjectId);
      }
      return true;
    }
    if (ctrl && key === "l") {
      mainWindow?.webContents.send("lurkwire:focus-url");
      mainWindow?.webContents.focus();
      return true;
    }
    if (ctrl && key === "f") {
      mainWindow?.webContents.send("lurkwire:open-find");
      mainWindow?.webContents.focus();
      return true;
    }
    if (ctrl && key === "r") {
      if (killed) {
        return true;
      }
      tabs?.reload(shift);
      return true;
    }
    if (key === "f5") {
      tabs?.reload(shift);
      return true;
    }
    if (ctrl && key === "h") {
      selectTool("history");
      return true;
    }
    if (ctrl && key === "b") {
      prefs = { ...prefs, bookmarksBar: !prefs.bookmarksBar };
      savePrefs(prefs);
      emit();
      return true;
    }
    if (ctrl && (key === "+" || key === "=")) {
      tabs?.adjustZoom(0.1);
      return true;
    }
    if (ctrl && key === "-") {
      tabs?.adjustZoom(-0.1);
      return true;
    }
    if (ctrl && key === "0") {
      tabs?.resetZoom();
      return true;
    }
    if (ctrl && key === ",") {
      setChromePage("settings");
      return true;
    }
    if ((ctrl && shift && key === "i") || key === "f12") {
      if (contents === mainWindow?.webContents) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      } else {
        tabs?.openDevTools();
      }
      return true;
    }
    if (input.alt && key === "arrowleft") {
      tabs?.back();
      return true;
    }
    if (input.alt && key === "arrowright") {
      tabs?.forward();
      return true;
    }
    if (key === "escape") {
      mainWindow?.webContents.send("lurkwire:escape");
      panels.close();
    }
    return false;
  };

  window.webContents.on("before-input-event", (event, input) => {
    if (handle(input, window.webContents)) {
      event.preventDefault();
    }
  });
  window.on("focus", () => {
    // tab views also need shortcuts
  });
}

function hookTabShortcuts(): void {
  // Tab webContents are created later; intercept via app-level event.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("before-input-event", (event, input) => {
      if (contents === mainWindow?.webContents) {
        return;
      }
      if (handleAppShortcut(input, contents)) {
        event.preventDefault();
      }
    });
  });
}

function handleAppShortcut(input: Electron.Input, contents: Electron.WebContents): boolean {
  // Reuse the same bindings when a page view has focus.
  if (input.type !== "keyDown") {
    return false;
  }
  const ctrl = input.control || input.meta;
  const shift = input.shift;
  const key = input.key.toLowerCase();
  if (ctrl && ["t", "w", "l", "f", "r", "h", "b", "+", "=", "-", "0", ",", "i"].includes(key)) {
    if (ctrl && key === "t") {
      void openNewTab();
    } else if (ctrl && shift && key === "t") {
      if (currentProjectId) {
        void tabs?.reopen(currentProjectId);
      }
    } else if (ctrl && key === "w") {
      const id = tabs?.activeInfo()?.id;
      if (id && currentProjectId) {
        tabs?.close(id, currentProjectId);
      }
    } else if (ctrl && key === "l") {
      mainWindow?.webContents.send("lurkwire:focus-url");
      mainWindow?.webContents.focus();
    } else if (ctrl && key === "f") {
      mainWindow?.webContents.send("lurkwire:open-find");
      mainWindow?.webContents.focus();
    } else if (ctrl && key === "r") {
      tabs?.reload(shift);
    } else if (ctrl && key === "h") {
      selectTool("history");
    } else if (ctrl && key === "b") {
      prefs = { ...prefs, bookmarksBar: !prefs.bookmarksBar };
      savePrefs(prefs);
      emit();
    } else if (ctrl && (key === "+" || key === "=")) {
      tabs?.adjustZoom(0.1);
    } else if (ctrl && key === "-") {
      tabs?.adjustZoom(-0.1);
    } else if (ctrl && key === "0") {
      tabs?.resetZoom();
    } else if (ctrl && key === ",") {
      setChromePage("settings");
    } else if (ctrl && shift && key === "i") {
      tabs?.openDevTools();
    }
    return true;
  }
  if (key === "f12") {
    tabs?.openDevTools();
    return true;
  }
  if (key === "f5") {
    tabs?.reload(shift);
    return true;
  }
  if (input.alt && (key === "arrowleft" || key === "arrowright")) {
    if (key === "arrowleft") {
      tabs?.back();
    } else {
      tabs?.forward();
    }
    return true;
  }
  void contents;
  return false;
}

async function openNewTab(url?: string): Promise<void> {
  if (!currentProjectId || !tabs) {
    throw new Error("No project is selected");
  }
  if (killed && url) {
    lastError = "Kill switch is on. Traffic is blocked.";
    emit();
    return;
  }
  await tabs.create(currentProjectId, url ?? "");
  tool = "browser";
  chromePage = "content";
  syncViewVisibility();
  emit();
}

function registerIpc(): void {
  ipcMain.handle("lurkwire:getState", () => snapshot());
  ipcMain.handle("lurkwire:newTab", (_event, url?: string) => openNewTab(url));
  ipcMain.handle("lurkwire:closeTab", (_event, id: string) => {
    if (!currentProjectId || !tabs) {
      return;
    }
    tabs.close(id, currentProjectId);
    emit();
  });
  ipcMain.handle("lurkwire:switchTab", (_event, id: string) => {
    tabs?.show(id);
    const info = tabs?.activeInfo();
    chromePage = info && isSettingsUrl(info.url) ? "settings" : "content";
    tool = chromePage === "settings" ? "settings" : "browser";
    syncViewVisibility();
    emit();
  });
  ipcMain.handle("lurkwire:navigate", async (_event, url: string) => {
    if (killed) {
      lastError = "Kill switch is on. Traffic is blocked.";
      emit();
      return;
    }
    const id = tabs?.activeInfo()?.id;
    if (!id) {
      return;
    }
    const kind = await tabs?.navigate(id, url);
    if (kind === "internal" && isSettingsUrl(normalizeOr(url))) {
      setChromePage("settings");
      return;
    }
    tool = "browser";
    setChromePage("content");
  });
  ipcMain.handle("lurkwire:back", () => {
    if (!killed) {
      tabs?.back();
    }
  });
  ipcMain.handle("lurkwire:forward", () => {
    if (!killed) {
      tabs?.forward();
    }
  });
  ipcMain.handle("lurkwire:reload", () => {
    if (!killed) {
      tabs?.reload();
    }
  });
  ipcMain.handle("lurkwire:stop", () => tabs?.stop());
  ipcMain.handle("lurkwire:openDevTools", () => tabs?.openDevTools());
  ipcMain.handle("lurkwire:setTool", (_event, next: ToolId) => {
    selectTool(next);
  });
  ipcMain.handle("lurkwire:setProject", async (_event, id: string) => {
    if (!tabs) {
      return;
    }
    if (currentProjectId) {
      tabs.hideProject(currentProjectId);
    }
    currentProjectId = id;
    await tabs.ensureTab(id);
    syncViewVisibility();
    emit();
  });
  ipcMain.handle("lurkwire:createProject", async (_event, name: string) => {
    const project = await control.createProject(name);
    await refreshProjects();
    currentProjectId = project.id;
    if (tabs) {
      await tabs.ensureTab(project.id);
    }
    emit();
    return project;
  });
  ipcMain.handle("lurkwire:reportBounds", (_event, bounds: Bounds) => {
    tabs?.setBounds(bounds);
    syncViewVisibility();
  });
  ipcMain.handle("lurkwire:listFlows", (_event, query: FlowQuery) => {
    return control.listFlows({
      ...query,
      project_id: query.project_id ?? currentProjectId ?? undefined,
    });
  });
  ipcMain.handle("lurkwire:getFlow", (_event, id: string) => control.getFlow(id));
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
  ipcMain.handle("lurkwire:windowMinimize", () => mainWindow?.minimize());
  ipcMain.handle("lurkwire:windowToggleMaximize", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle("lurkwire:windowClose", () => mainWindow?.close());
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
  ipcMain.handle("lurkwire:findInPage", (_event, text: string, options?: Electron.FindInPageOptions) => {
    tabs?.find(text, options);
  });
  ipcMain.handle("lurkwire:stopFindInPage", () => tabs?.stopFind());
  ipcMain.handle("lurkwire:setZoom", (_event, factor: number) => tabs?.setZoom(factor));
  ipcMain.handle("lurkwire:adjustZoom", (_event, delta: number) => tabs?.adjustZoom(delta));
  ipcMain.handle("lurkwire:resetZoom", () => tabs?.resetZoom());
  ipcMain.handle("lurkwire:pinTab", (_event, id: string, pinned: boolean) => tabs?.pin(id, pinned));
  ipcMain.handle("lurkwire:duplicateTab", (_event, id: string) => tabs?.duplicate(id));
  ipcMain.handle("lurkwire:closeOtherTabs", (_event, id: string) => {
    if (currentProjectId) {
      tabs?.closeOthers(id, currentProjectId);
    }
  });
  ipcMain.handle("lurkwire:closeTabsToRight", (_event, id: string) => {
    if (currentProjectId) {
      tabs?.closeToRight(id, currentProjectId);
    }
  });
  ipcMain.handle("lurkwire:reopenTab", () => {
    if (currentProjectId) {
      return tabs?.reopen(currentProjectId);
    }
    return undefined;
  });
  ipcMain.handle("lurkwire:pageAction", (_event, action: string, url?: string) => {
    tabs?.execPageAction(action, url);
  });
  ipcMain.handle("lurkwire:copyText", (_event, text: string) => clipboard.writeText(text));
  ipcMain.handle("lurkwire:openExternal", (_event, url: string) => shell.openExternal(url));
  ipcMain.handle("lurkwire:openPanel", (_event, request: PanelOpenRequest) => panels.open(request));
  ipcMain.handle("lurkwire:closePanel", () => panels.close());
  ipcMain.handle("lurkwire:resizePanel", (_event, width: number, height: number) => {
    panels.resize(width, height);
  });
  ipcMain.handle("lurkwire:getPanelContext", () => panels.current());
  ipcMain.handle("lurkwire:requestFind", () => {
    mainWindow?.webContents.send("lurkwire:open-find");
    mainWindow?.focus();
    mainWindow?.webContents.focus();
  });
  ipcMain.handle("lurkwire:revealPath", (_event, filePath: string) => shell.showItemInFolder(filePath));
}

function normalizeOr(input: string): string {
  const trimmed = input.trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

hookTabShortcuts();

app.whenReady().then(async () => {
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
