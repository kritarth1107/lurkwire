export type ChromeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
