import { BrowserWindow, type WebContents } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PanelKind, PanelOpenRequest } from "../shared/types";

export type PanelContext = {
  kind: PanelKind;
  payload: Record<string, unknown>;
};

export class PanelManager {
  private window: BrowserWindow | null = null;
  private context: PanelContext | null = null;

  constructor(
    private getParent: () => BrowserWindow | null,
    private themeBackground: () => string,
  ) {}

  current(): PanelContext | null {
    return this.context;
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
    this.context = null;
  }

  async open(request: PanelOpenRequest): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      return;
    }
    this.close();
    const width = Math.round(request.width ?? 280);
    const height = Math.round(request.height ?? 320);
    this.context = { kind: request.kind, payload: request.payload ?? {} };
    const win = new BrowserWindow({
      parent,
      modal: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      width,
      height,
      x: Math.round(request.x),
      y: Math.round(request.y),
      backgroundColor: this.themeBackground(),
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window = win;
    win.on("blur", () => {
      if (this.window === win) {
        this.close();
      }
    });
    win.on("closed", () => {
      if (this.window === win) {
        this.window = null;
        this.context = null;
      }
    });
    await this.load(win, request.kind);
    if (!win.isDestroyed()) {
      win.show();
    }
  }

  resize(width: number, height: number): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }
    this.window.setContentSize(Math.round(width), Math.round(height), false);
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args);
    }
  }

  isPanel(contents: WebContents): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.webContents === contents);
  }

  private async load(win: BrowserWindow, kind: PanelKind): Promise<void> {
    const hash = `#/panel/${kind}`;
    if (process.env.ELECTRON_RENDERER_URL) {
      await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}${hash}`);
      return;
    }
    await win.loadFile(join(__dirname, "../renderer/index.html"), { hash: `/panel/${kind}` });
    void pathToFileURL;
  }
}
