import type { PopoverAlign, PopoverPlacement } from "./anchorPopover";

/** Enter duration for popovers, dropdowns, and tooltips (ease-out). */
export const POPOVER_ENTER_MS = 140;
/** Leave duration; slightly shorter so dismissal feels snappy. */
export const POPOVER_EXIT_MS = 120;
export const POPOVER_EASING = "ease-out";
export const POPOVER_EXIT_EASING = "ease-in";
export const POPOVER_SCALE_FROM = 0.96;

export function popoverTransformOrigin(align: PopoverAlign, placement: PopoverPlacement): string {
  const x = align === "end" ? "right" : "left";
  const y = placement === "above" ? "bottom" : "top";
  return `${x} ${y}`;
}

export function popoverMotionStyle(input: {
  left: number;
  top: number;
  align: PopoverAlign;
  placement: PopoverPlacement;
  leaving?: boolean;
}): {
  left: number;
  top: number;
  transformOrigin: string;
  animationDuration: string;
  animationTimingFunction: string;
} {
  const leaving = Boolean(input.leaving);
  return {
    left: input.left,
    top: input.top,
    transformOrigin: popoverTransformOrigin(input.align, input.placement),
    animationDuration: `${leaving ? POPOVER_EXIT_MS : POPOVER_ENTER_MS}ms`,
    animationTimingFunction: leaving ? POPOVER_EXIT_EASING : POPOVER_EASING,
  };
}
