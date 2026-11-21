export type ClientRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PopoverAlign = "start" | "end";
export type PopoverPlacement = "below" | "above";

export type AnchoredPositionInput = {
  trigger: ClientRect;
  width: number;
  height: number;
  viewport: { width: number; height: number };
  align?: PopoverAlign;
  placement?: PopoverPlacement;
  gap?: number;
  margin?: number;
};

export type AnchoredPosition = {
  left: number;
  top: number;
  align: PopoverAlign;
  placement: PopoverPlacement;
};

/**
 * Position a popover in the same viewport as `trigger` (getBoundingClientRect
 * space). Prefer the requested alignment and placement, flip if it would
 * overflow, then clamp so the popover stays inside the viewport.
 */
export function computeAnchoredPosition(input: AnchoredPositionInput): AnchoredPosition {
  const gap = input.gap ?? 2;
  const margin = input.margin ?? 8;
  const { trigger, width, height, viewport } = input;
  let align: PopoverAlign = input.align ?? "start";
  let placement: PopoverPlacement = input.placement ?? "below";

  const maxLeft = Math.max(margin, viewport.width - margin - width);
  const startLeft = trigger.left;
  const endLeft = trigger.right - width;

  let left = align === "end" ? endLeft : startLeft;
  if (left + width > viewport.width - margin) {
    if (endLeft >= margin) {
      left = endLeft;
      align = "end";
    }
  }
  if (left < margin) {
    if (startLeft + width <= viewport.width - margin) {
      left = startLeft;
      align = "start";
    }
  }
  left = Math.min(Math.max(left, margin), maxLeft);

  const belowTop = trigger.bottom + gap;
  const aboveTop = trigger.top - gap - height;
  let top = placement === "above" ? aboveTop : belowTop;

  if (placement !== "above" && top + height > viewport.height - margin) {
    if (aboveTop >= margin) {
      top = aboveTop;
      placement = "above";
    }
  }
  if (top < margin) {
    if (belowTop + height <= viewport.height - margin) {
      top = belowTop;
      placement = "below";
    } else {
      top = margin;
    }
  }
  const maxTop = Math.max(margin, viewport.height - margin - height);
  if (top + height > viewport.height - margin) {
    top = maxTop;
  }

  return { left: Math.round(left), top: Math.round(top), align, placement };
}
