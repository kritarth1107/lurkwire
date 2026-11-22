import { describe, expect, it } from "vitest";
import { computeAnchoredPosition } from "./anchorPopover";
import {
  POPOVER_EASING,
  POPOVER_ENTER_MS,
  POPOVER_EXIT_MS,
  popoverMotionStyle,
  popoverTransformOrigin,
} from "./popoverMotion";

describe("popover motion", () => {
  it("keeps enter/exit in the 120–160ms ease-out band", () => {
    expect(POPOVER_ENTER_MS).toBeGreaterThanOrEqual(120);
    expect(POPOVER_ENTER_MS).toBeLessThanOrEqual(160);
    expect(POPOVER_EXIT_MS).toBeGreaterThanOrEqual(100);
    expect(POPOVER_EXIT_MS).toBeLessThanOrEqual(160);
    expect(POPOVER_EASING).toBe("ease-out");
  });

  it("origins a below-start popover from the top-left of the panel", () => {
    expect(popoverTransformOrigin("start", "below")).toBe("left top");
    expect(popoverTransformOrigin("end", "above")).toBe("right bottom");
  });

  it("ties animation origin to the computed anchor placement", () => {
    const positioned = computeAnchoredPosition({
      trigger: { left: 1200, top: 40, right: 1260, bottom: 72 },
      width: 320,
      height: 280,
      viewport: { width: 1280, height: 800 },
      align: "end",
      placement: "below",
    });
    expect(positioned.align).toBe("end");
    const style = popoverMotionStyle({ ...positioned });
    expect(style.left).toBe(positioned.left);
    expect(style.top).toBe(positioned.top);
    expect(style.transformOrigin).toBe(popoverTransformOrigin(positioned.align, positioned.placement));
    expect(style.animationDuration).toBe(`${POPOVER_ENTER_MS}ms`);
    expect(style.animationTimingFunction).toBe("ease-out");
    const leaving = popoverMotionStyle({ ...positioned, leaving: true });
    expect(leaving.animationDuration).toBe(`${POPOVER_EXIT_MS}ms`);
    expect(leaving.animationTimingFunction).toBe("ease-in");
  });
});
