import type { PanelKind } from "../../../shared/types";

export function openAnchoredPanel(
  kind: PanelKind,
  anchor: HTMLElement,
  options?: { width?: number; height?: number; payload?: Record<string, unknown>; below?: boolean },
): void {
  const rect = anchor.getBoundingClientRect();
  const below = options?.below ?? true;
  void window.lurkwire.openPanel({
    kind,
    x: Math.round(window.screenX + rect.left),
    y: Math.round(window.screenY + (below ? rect.bottom : rect.top)),
    width: options?.width,
    height: options?.height,
    payload: options?.payload,
  });
}

export function openAtCursor(
  kind: PanelKind,
  event: { clientX: number; clientY: number },
  options?: { width?: number; height?: number; payload?: Record<string, unknown> },
): void {
  void window.lurkwire.openPanel({
    kind,
    x: Math.round(window.screenX + event.clientX),
    y: Math.round(window.screenY + event.clientY),
    width: options?.width,
    height: options?.height,
    payload: options?.payload,
  });
}
