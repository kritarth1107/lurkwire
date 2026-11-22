import { describe, expect, it } from "vitest";
import { insetStageForOverlay } from "./chromeBounds";

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
