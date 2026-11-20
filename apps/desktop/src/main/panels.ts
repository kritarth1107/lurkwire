import { BrowserWindow, screen, type WebContents } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { computePanelPosition } from "../shared/panelBounds";
import type { PanelKind, PanelOpenRequest } from "../shared/types";

export type PanelContext = {
  kind: PanelKind;
  payload: Record<string, unknown>;
};

export class PanelManager {
  private window: BrowserWindow | null = null;
  private context: PanelContext | null = null;
  private lastRequest: PanelOpenRequest | null = null;
  private unbindParent: (() => void) | null = null;

  constructor(
    private getParent: () => BrowserWindow | null,
    private themeBackground: () => string,
  ) {}

  current(): PanelContext | null {
    return this.context;
  }

  close(): void {
    this.unbindParent?.();
    this.unbindParent = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
    this.context = null;
    this.lastRequest = null;
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
    this.lastRequest = { ...request, width, height };
    const position = this.positionFor(parent, this.lastRequest);

    // On Linux, child windows often ignore constructor coordinates and appear at
    // the parent's origin. A frameless popup without a parent, then an explicit
    // setPosition after show, lands next to the anchoring button.
    const useParent = process.platform !== "linux";
    const win = new BrowserWindow({
      parent: useParent ? parent : undefined,
      modal: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      width,
      height,
      x: position.x,
      y: position.y,
      backgroundColor: this.themeBackground(),
      autoHideMenuBar: true,
      type: process.platform === "linux" ? "popup" : undefined,
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
        this.lastRequest = null;
      }
    });
    this.bindParent(parent);
    await this.load(win, request.kind);
    if (win.isDestroyed()) {
      return;
    }
    this.applyPosition(win, parent);
    win.show();
    this.applyPosition(win, parent);
    setTimeout(() => this.applyPosition(win, parent), 0);
    setTimeout(() => this.applyPosition(win, parent), 50);
  }

  resize(width: number, height: number): void {
    if (!this.window || this.window.isDestroyed() || !this.lastRequest) {
      return;
    }
    this.lastRequest = { ...this.lastRequest, width: Math.round(width), height: Math.round(height) };
    this.window.setContentSize(this.lastRequest.width!, this.lastRequest.height!, false);
    const parent = this.getParent();
    if (parent) {
      this.applyPosition(this.window, parent);
    }
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args);
    }
  }

  isPanel(contents: WebContents): boolean {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.webContents === contents);
  }

  private positionFor(parent: BrowserWindow, request: PanelOpenRequest): { x: number; y: number } {
    const content = parent.getContentBounds();
    const workArea = screen.getDisplayMatching(content).workArea;
    const width = Math.round(request.width ?? 280);
    const height = Math.round(request.height ?? 320);
    const anchor = request.anchor ?? {
      left: request.x,
      top: request.y,
      right: request.x,
      bottom: request.y,
    };
    return computePanelPosition({
      content,
      workArea,
      anchor,
      width,
      height,
      align: request.align,
      placement: request.placement,
    });
  }

  private applyPosition(win: BrowserWindow, parent: BrowserWindow): void {
    if (win.isDestroyed() || !this.lastRequest) {
      return;
    }
    const wanted = this.positionFor(parent, this.lastRequest);
    win.setPosition(wanted.x, wanted.y);
    const actual = win.getBounds();
    if (Math.abs(actual.x - wanted.x) > 8 || Math.abs(actual.y - wanted.y) > 8) {
      // Some Linux builds treat setPosition as parent-relative for child windows.
      const content = parent.getContentBounds();
      win.setPosition(wanted.x - content.x, wanted.y - content.y);
      const retry = win.getBounds();
      if (Math.abs(retry.x - wanted.x) > Math.abs(actual.x - wanted.x)) {
        win.setPosition(wanted.x, wanted.y);
      }
    }
  }

  private bindParent(parent: BrowserWindow): void {
    const close = () => this.close();
    parent.on("move", close);
    parent.on("resize", close);
    parent.on("minimize", close);
    parent.on("closed", close);
    this.unbindParent = () => {
      if (!parent.isDestroyed()) {
        parent.off("move", close);
        parent.off("resize", close);
        parent.off("minimize", close);
        parent.off("closed", close);
      }
    };
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
