export type ClientRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PanelAlign = "start" | "end";
export type PanelPlacement = "below" | "above";

export type PanelBoundsInput = {
  content: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  anchor: ClientRect;
  width: number;
  height: number;
  align?: PanelAlign;
  placement?: PanelPlacement;
  gap?: number;
};

/** Anchor client rect is relative to the parent window's content area. */
export function computePanelPosition(input: PanelBoundsInput): { x: number; y: number } {
  const gap = input.gap ?? 2;
  const align = input.align ?? "start";
  const placement = input.placement ?? "below";
  const { content, workArea: work, width, height, anchor } = input;

  const left = content.x + anchor.left;
  const top = content.y + anchor.top;
  const right = content.x + anchor.right;
  const bottom = content.y + anchor.bottom;

  let x = align === "end" ? right - width : left;
  let y = placement === "above" ? top - gap - height : bottom + gap;

  if (x + width > work.x + work.width) {
    x = work.x + work.width - width;
  }
  if (x < work.x) {
    x = work.x;
  }

  if (placement !== "above" && y + height > work.y + work.height) {
    y = top - gap - height;
  }
  if (y < work.y) {
    if (bottom + gap + height <= work.y + work.height) {
      y = bottom + gap;
    } else {
      y = work.y;
    }
  }
  if (y + height > work.y + work.height) {
    y = Math.max(work.y, work.y + work.height - height);
  }

  return { x: Math.round(x), y: Math.round(y) };
}
