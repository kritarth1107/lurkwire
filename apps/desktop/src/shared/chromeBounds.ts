export type ChromeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Marks floating UI so the native page view can yield to it. */
export const OVERLAY_ATTR = "data-lw-overlay";

export type OverlayRect = ChromeRect;

function right(rect: ChromeRect): number {
  return rect.x + rect.width;
}

function bottom(rect: ChromeRect): number {
  return rect.y + rect.height;
}

export function rectsOverlap(a: ChromeRect, b: ChromeRect, slack = 0.5): boolean {
  return (
    a.x < right(b) - slack &&
    right(a) > b.x + slack &&
    a.y < bottom(b) - slack &&
    bottom(a) > b.y + slack
  );
}

function overlapArea(a: ChromeRect, b: ChromeRect): number {
  const width = Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y));
  return width * height;
}

/** Shrink the native page view so an overlay (omnibox, etc.) is not covered. */
export function insetStageForOverlay(
  stage: ChromeRect,
  overlayBottom: number | null | undefined,
): ChromeRect {
  if (overlayBottom == null || !Number.isFinite(overlayBottom)) {
    return stage;
  }
  const overflow = Math.ceil(overlayBottom - stage.y);
  if (overflow <= 0) {
    return stage;
  }
  return {
    x: stage.x,
    y: stage.y + overflow,
    width: stage.width,
    height: Math.max(0, stage.height - overflow),
  };
}

const CHROME_HANG_SLACK = 8;
const COVER_RATIO = 0.5;

/**
 * Yield the native page view to every floating overlay that would otherwise
 * be painted underneath it. Top-hanging chrome menus inset the stage below
 * them (same as the omnibox). Mid-page menus and large modal backdrops hide
 * the page view entirely so the overlay can occupy the stage.
 */
export function insetStageForOverlays(stage: ChromeRect, overlays: OverlayRect[]): ChromeRect {
  const hits = overlays.filter(
    (overlay) => overlay.width > 0 && overlay.height > 0 && rectsOverlap(stage, overlay),
  );
  if (!hits.length) {
    return stage;
  }
  const stageArea = stage.width * stage.height;
  const coversMost =
    stageArea > 0 && hits.some((overlay) => overlapArea(stage, overlay) / stageArea >= COVER_RATIO);
  const hangsFromChrome = hits.every((overlay) => overlay.y <= stage.y + CHROME_HANG_SLACK);
  if (coversMost || !hangsFromChrome) {
    return { x: stage.x, y: stage.y, width: stage.width, height: 0 };
  }
  const maxBottom = Math.max(...hits.map((overlay) => bottom(overlay)));
  return insetStageForOverlay(stage, maxBottom);
}

export type CssMatrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
};

/** Parse a computed `transform` value into a 2D matrix, if possible. */
export function parseCssMatrix(transform: string | null | undefined): CssMatrix2D | null {
  if (!transform || transform === "none") {
    return null;
  }
  const two = /^matrix\((.+)\)$/.exec(transform.trim());
  if (two?.[1]) {
    const values = two[1].split(",").map((item) => Number(item.trim()));
    if (values.length === 6 && values.every(Number.isFinite)) {
      return { a: values[0]!, b: values[1]!, c: values[2]!, d: values[3]!, e: values[4]!, f: values[5]! };
    }
  }
  const three = /^matrix3d\((.+)\)$/.exec(transform.trim());
  if (three?.[1]) {
    const values = three[1].split(",").map((item) => Number(item.trim()));
    if (values.length === 16 && values.every(Number.isFinite)) {
      return { a: values[0]!, b: values[1]!, c: values[4]!, d: values[5]!, e: values[12]!, f: values[13]! };
    }
  }
  return null;
}

/**
 * Recover an element's untransformed viewport box from its (possibly
 * mid-animation) bounding rect, layout size, and computed transform.
 * Scale enter animations shrink getBoundingClientRect(); the native page
 * view must yield to the final overlay size, not the scaled frame.
 */
export function untransformedOverlayRect(input: {
  visual: OverlayRect;
  width: number;
  height: number;
  transform?: string | null;
  originX: number;
  originY: number;
}): OverlayRect {
  const width = input.width;
  const height = input.height;
  if (width <= 0 || height <= 0) {
    return input.visual;
  }
  const matrix = parseCssMatrix(input.transform);
  if (!matrix) {
    return { x: input.visual.x, y: input.visual.y, width, height };
  }
  const ox = input.originX;
  const oy = input.originY;
  const corners: Array<readonly [number, number]> = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([px, py]) => {
    const x = px - ox;
    const y = py - oy;
    return [matrix.a * x + matrix.c * y + matrix.e + ox, matrix.b * x + matrix.d * y + matrix.f + oy] as const;
  });
  const minX = Math.min(...corners.map((corner) => corner[0]));
  const minY = Math.min(...corners.map((corner) => corner[1]));
  return {
    x: input.visual.x - minX,
    y: input.visual.y - minY,
    width,
    height,
  };
}
