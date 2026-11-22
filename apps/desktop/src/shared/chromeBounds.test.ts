import { describe, expect, it } from "vitest";
import { insetStageForOverlay, insetStageForOverlays, rectsOverlap, untransformedOverlayRect } from "./chromeBounds";

const stage = { x: 0, y: 200, width: 1200, height: 800 };

describe("insetStageForOverlay", () => {
  it("leaves the stage alone when no overlay is open", () => {
    expect(insetStageForOverlay(stage, null)).toEqual(stage);
    expect(insetStageForOverlay(stage, undefined)).toEqual(stage);
  });

  it("leaves the stage alone when the overlay stays in the chrome above it", () => {
    expect(insetStageForOverlay(stage, 200)).toEqual(stage);
    expect(insetStageForOverlay(stage, 180)).toEqual(stage);
  });

  it("pushes the page view below an overlay that crosses the stage", () => {
    expect(insetStageForOverlay(stage, 452)).toEqual({
      x: 0,
      y: 452,
      width: 1200,
      height: 548,
    });
  });

  it("clamps height when the overlay covers the whole stage", () => {
    expect(insetStageForOverlay(stage, 2000)).toEqual({
      x: 0,
      y: 2000,
      width: 1200,
      height: 0,
    });
  });
});

describe("insetStageForOverlays", () => {
  it("leaves the stage alone when no overlay intersects it", () => {
    expect(insetStageForOverlays(stage, [])).toEqual(stage);
    expect(
      insetStageForOverlays(stage, [{ x: 40, y: 40, width: 280, height: 80 }]),
    ).toEqual(stage);
  });

  it("insets below a top-hanging dropdown, using the lowest overlapping edge", () => {
    expect(
      insetStageForOverlays(stage, [
        { x: 200, y: 120, width: 400, height: 200 },
        { x: 200, y: 120, width: 400, height: 332 },
      ]),
    ).toEqual({ x: 0, y: 452, width: 1200, height: 548 });
  });

  it("hides the page view for a mid-page context menu", () => {
    expect(
      insetStageForOverlays(stage, [{ x: 320, y: 420, width: 220, height: 260 }]),
    ).toEqual({ x: 0, y: 200, width: 1200, height: 0 });
  });

  it("hides the page view when a modal backdrop covers most of the stage", () => {
    expect(
      insetStageForOverlays(stage, [{ x: 0, y: 0, width: 1200, height: 1000 }]),
    ).toEqual({ x: 0, y: 200, width: 1200, height: 0 });
  });
});

describe("rectsOverlap", () => {
  it("detects overlap and ignores a touching edge", () => {
    expect(rectsOverlap(stage, { x: 0, y: 100, width: 100, height: 100 })).toBe(false);
    expect(rectsOverlap(stage, { x: 0, y: 100, width: 100, height: 101 })).toBe(true);
  });
});

describe("untransformedOverlayRect", () => {
  it("recovers the layout box from a mid-animation scale(0.96) frame", () => {
    // Matches the observed tool-menu enter animation: scale from center plus
    // a slight translateY, which shrinks getBoundingClientRect by ~4%.
    const layout = { x: 551, y: 123, width: 320, height: 395 };
    const visual = untransformedOverlayRect({
      visual: { x: 557.4, y: 127.06, width: 307.2, height: 379.24 },
      width: 320,
      height: 395,
      transform: "matrix(0.96, 0, 0, 0.96, 0, -3.84)",
      originX: 160,
      originY: 197.5,
    });
    expect(visual.x).toBeCloseTo(layout.x, 1);
    expect(visual.y).toBeCloseTo(layout.y, 1);
    expect(visual.width).toBe(320);
    expect(visual.height).toBe(395);
  });

  it("returns the visual box when no transform is applied", () => {
    const visual = { x: 10, y: 20, width: 100, height: 50 };
    expect(untransformedOverlayRect({ visual, width: 100, height: 50, transform: "none", originX: 50, originY: 25 })).toEqual(
      visual,
    );
  });
});
