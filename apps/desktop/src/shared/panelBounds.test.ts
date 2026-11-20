import { describe, expect, it } from "vitest";
import { computePanelPosition } from "./panelBounds";

const content = { x: 200, y: 100, width: 1200, height: 800 };
const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe("computePanelPosition", () => {
  it("places a start-aligned panel just below the anchor", () => {
    const pos = computePanelPosition({
      content,
      workArea,
      anchor: { left: 80, top: 40, right: 112, bottom: 72 },
      width: 320,
      height: 220,
      align: "start",
      placement: "below",
    });
    expect(pos).toEqual({ x: 280, y: 174 });
  });

  it("places an end-aligned panel so its right edge matches the button", () => {
    const pos = computePanelPosition({
      content,
      workArea,
      anchor: { left: 1140, top: 48, right: 1172, bottom: 80 },
      width: 260,
      height: 470,
      align: "end",
      placement: "below",
    });
    expect(pos).toEqual({ x: 200 + 1172 - 260, y: 100 + 80 + 2 });
  });

  it("flips above the button when it would overflow the work area", () => {
    const pos = computePanelPosition({
      content: { x: 0, y: 800, width: 800, height: 200 },
      workArea: { x: 0, y: 0, width: 800, height: 1000 },
      anchor: { left: 500, top: 160, right: 532, bottom: 192 },
      width: 360,
      height: 320,
      align: "end",
      placement: "below",
    });
    expect(pos.y).toBe(800 + 160 - 2 - 320);
    expect(pos.x).toBe(532 - 360);
  });

  it("clamps to the work area instead of going off-screen to the right", () => {
    const pos = computePanelPosition({
      content: { x: 1700, y: 0, width: 200, height: 800 },
      workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      anchor: { left: 160, top: 10, right: 192, bottom: 42 },
      width: 360,
      height: 200,
      align: "start",
    });
    expect(pos.x + 360).toBeLessThanOrEqual(1920);
    expect(pos.x).toBe(1560);
  });
});
