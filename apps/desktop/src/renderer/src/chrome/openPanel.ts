import type { PanelAlign, PanelKind, PanelPlacement } from "../../../shared/types";

const END_KINDS: ReadonlySet<PanelKind> = new Set([
  "appmenu",
  "downloads",
  "alltabs",
  "lurkwire",
  "intercept",
  "project",
]);

export function openAnchoredPanel(
  kind: PanelKind,
  anchor: HTMLElement,
  options?: {
    width?: number;
    height?: number;
    payload?: Record<string, unknown>;
    below?: boolean;
    align?: PanelAlign;
    placement?: PanelPlacement;
  },
): void {
  const rect = anchor.getBoundingClientRect();
  const placement: PanelPlacement = options?.placement ?? (options?.below === false ? "above" : "below");
  const align: PanelAlign = options?.align ?? (END_KINDS.has(kind) ? "end" : "start");
  void window.lurkwire.openPanel({
    kind,
    x: Math.round(rect.left),
    y: Math.round(placement === "above" ? rect.top : rect.bottom),
    width: options?.width,
    height: options?.height,
    payload: options?.payload,
    anchor: {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    },
    align,
    placement,
  });
}

export function openAtCursor(
  kind: PanelKind,
  event: { clientX: number; clientY: number },
  options?: { width?: number; height?: number; payload?: Record<string, unknown> },
): void {
  const x = event.clientX;
  const y = event.clientY;
  void window.lurkwire.openPanel({
    kind,
    x: Math.round(x),
    y: Math.round(y),
    width: options?.width,
    height: options?.height,
    payload: options?.payload,
    anchor: { left: x, top: y, right: x, bottom: y },
    align: "start",
    placement: "below",
  });
}
