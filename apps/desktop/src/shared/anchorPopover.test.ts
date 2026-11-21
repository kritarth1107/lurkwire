import { describe, expect, it } from "vitest";
import { computeAnchoredPosition } from "./anchorPopover";

const viewport = { width: 1280, height: 800 };

describe("computeAnchoredPosition", () => {
  it("right-aligns a hamburger menu under the trailing toolbar button", () => {
    // Button sits on the far right of a 1280px chrome window, like the app menu.
    const pos = computeAnchoredPosition({
      trigger: { left: 1240, top: 8, right: 1272, bottom: 40 },
      width: 320,
      height: 620,
      viewport,
      align: "end",
      placement: "below",
    });
    expect(pos.left).toBe(1272 - 320);
    expect(pos.top).toBe(42);
    expect(pos.align).toBe("end");
    expect(pos.placement).toBe("below");
    // Must not fall back to the left edge / sidebar (the reported bug ~x=105).
    expect(pos.left).toBeGreaterThan(800);
    expect(pos.left + 320).toBe(1272);
  });

  it("start-aligns the site-identity popover under the lock button", () => {
    const pos = computeAnchoredPosition({
      trigger: { left: 120, top: 8, right: 152, bottom: 40 },
      width: 380,
      height: 560,
      viewport,
      align: "start",
      placement: "below",
    });
    expect(pos.left).toBe(120);
    expect(pos.top).toBe(42);
  });

  it("flips above the trigger when there is not enough room below", () => {
    const pos = computeAnchoredPosition({
      trigger: { left: 900, top: 700, right: 932, bottom: 732 },
      width: 360,
      height: 320,
      viewport,
      align: "end",
      placement: "below",
    });
    expect(pos.placement).toBe("above");
    expect(pos.top).toBe(700 - 2 - 320);
    expect(pos.left).toBe(932 - 360);
  });

  it("clamps to the viewport instead of overflowing the right edge", () => {
    const pos = computeAnchoredPosition({
      trigger: { left: 1200, top: 8, right: 1232, bottom: 40 },
      width: 360,
      height: 200,
      viewport: { width: 1240, height: 800 },
      align: "start",
    });
    expect(pos.left + 360).toBeLessThanOrEqual(1240 - 8);
    expect(pos.left).toBe(1240 - 8 - 360);
  });

  it("clamps to the viewport instead of overflowing the left edge", () => {
    const pos = computeAnchoredPosition({
      trigger: { left: 10, top: 8, right: 42, bottom: 40 },
      width: 360,
      height: 200,
      viewport: { width: 800, height: 600 },
      align: "end",
    });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + 360).toBeLessThanOrEqual(800 - 8);
  });

  it("keeps a tall menu inside a short viewport", () => {
    const pos = computeAnchoredPosition({
      trigger: { left: 1240, top: 8, right: 1272, bottom: 40 },
      width: 320,
      height: 900,
      viewport: { width: 1280, height: 720 },
      align: "end",
    });
    expect(pos.top).toBe(8);
    expect(pos.left).toBe(1272 - 320);
  });
});
