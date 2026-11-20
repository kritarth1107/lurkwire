import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import type {
  AppSnapshot,
  Bounds,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  RepeaterSendRequest,
  ToolId,
} from "../shared/types";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../shared/types";

app.setName(PRODUCT_NAME);
import { ControlClient } from "./control";
import { ProxySidecar } from "./proxy";
import { TabManager } from "./tabs";

let mainWindow: BrowserWindow | null = null;
let tabs: TabManager | null = null;
const sidecar = new ProxySidecar();
const control = new ControlClient(() => sidecar.ready);

let tool: ToolId = "browser";
let currentProjectId: string | null = null;
let projects: AppSnapshot["projects"] = [];
let proxyStatus: AppSnapshot["proxy"] = { status: "starting" };
let lastError: string | null = null;

function snapshot(): AppSnapshot {
  return {
    product: PRODUCT_NAME,
    version: PRODUCT_VERSION,
    proxy: proxyStatus,
    projects,
    currentProjectId,
    tabs: currentProjectId && tabs ? tabs.list(currentProjectId) : [],
    activeTabId: tabs?.activeInfo()?.id ?? null,
    tool,
    error: lastError,
  };
}

function emit(): void {
  mainWindow?.webContents.send("lurkwire:state", snapshot());
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
  emit();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    title: PRODUCT_NAME,
    icon: join(__dirname, "../../build/icon.png"),
    backgroundColor: "#0c0e12",
    show: false,
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
    emit,
  );

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle("lurkwire:getState", () => snapshot());

  ipcMain.handle("lurkwire:newTab", async (_event, url?: string) => {
    if (!currentProjectId || !tabs) {
      throw new Error("No project is selected");
    }
    await tabs.create(currentProjectId, url ?? "");
    tool = "browser";
    tabs.setVisible(true);
    emit();
  });

  ipcMain.handle("lurkwire:closeTab", (_event, id: string) => {
    if (!currentProjectId || !tabs) {
      return;
    }
    tabs.close(id, currentProjectId);
    emit();
  });

  ipcMain.handle("lurkwire:switchTab", (_event, id: string) => {
    tabs?.show(id);
    tool = "browser";
    tabs?.setVisible(true);
    emit();
  });

  ipcMain.handle("lurkwire:navigate", async (_event, url: string) => {
    const id = tabs?.activeInfo()?.id;
    if (!id) {
      return;
    }
    tool = "browser";
    tabs?.setVisible(true);
    await tabs?.navigate(id, url);
  });

  ipcMain.handle("lurkwire:back", () => tabs?.back());
  ipcMain.handle("lurkwire:forward", () => tabs?.forward());
  ipcMain.handle("lurkwire:reload", () => tabs?.reload());
  ipcMain.handle("lurkwire:stop", () => tabs?.stop());
  ipcMain.handle("lurkwire:openDevTools", () => tabs?.openDevTools());

  ipcMain.handle("lurkwire:setTool", (_event, next: ToolId) => {
    tool = next;
    tabs?.setVisible(next === "browser");
    emit();
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
}

app.whenReady().then(async () => {
  registerIpc();
  createWindow();

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
