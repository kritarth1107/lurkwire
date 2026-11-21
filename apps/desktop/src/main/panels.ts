import { BrowserWindow, type WebContents } from "electron";
import type { PanelKind, PanelOpenRequest } from "../shared/types";

export type PanelContext = {
  kind: PanelKind;
  payload: Record<string, unknown>;
};

/**
 * Popovers are rendered in the chrome window (see PanelHost). A separate
 * BrowserWindow cannot be reliably positioned on Wayland, which is why the
 * app menu previously appeared at the far left of the parent window.
 */
export class PanelManager {
  private context: PanelContext | null = null;
  private lastRequest: PanelOpenRequest | null = null;

  constructor(
    private getParent: () => BrowserWindow | null,
    _themeBackground?: () => string,
  ) {}

  current(): PanelContext | null {
    return this.context;
  }

  currentWindow(): BrowserWindow | null {
    return null;
  }

  close(): void {
    this.context = null;
    this.lastRequest = null;
    const parent = this.getParent();
    if (parent && !parent.isDestroyed() && !parent.webContents.isDestroyed()) {
      parent.webContents.send("lurkwire:hidePanel");
    }
  }

  async open(request: PanelOpenRequest): Promise<void> {
    const parent = this.getParent();
    if (!parent || parent.isDestroyed()) {
      return;
    }
    const width = Math.round(request.width ?? 280);
    const height = Math.round(request.height ?? 320);
    const view = toViewportRequest(parent, { ...request, width, height });
    this.context = { kind: request.kind, payload: request.payload ?? {} };
    this.lastRequest = view;
    parent.webContents.send("lurkwire:showPanel", view);
  }

  resize(width: number, height: number): void {
    if (!this.lastRequest) {
      return;
    }
    this.lastRequest = { ...this.lastRequest, width: Math.round(width), height: Math.round(height) };
    const parent = this.getParent();
    if (parent && !parent.isDestroyed() && !parent.webContents.isDestroyed()) {
      parent.webContents.send("lurkwire:showPanel", this.lastRequest);
    }
  }

  send(_channel: string, ..._args: unknown[]): void {
    // Popovers now live in the chrome renderer, which already receives these events.
  }

  isPanel(_contents: WebContents): boolean {
    return false;
  }
}

function toViewportRequest(parent: BrowserWindow, request: PanelOpenRequest): PanelOpenRequest {
  if (request.anchor) {
    return request;
  }
  // x/y from page context menus are screen coordinates.
  const content = parent.getContentBounds();
  const left = request.x - content.x;
  const top = request.y - content.y;
  return {
    ...request,
    anchor: { left, top, right: left, bottom: top },
    align: request.align ?? "start",
    placement: request.placement ?? "below",
  };
}
