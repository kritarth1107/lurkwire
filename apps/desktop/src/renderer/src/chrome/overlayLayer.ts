import { OVERLAY_ATTR, untransformedOverlayRect, type OverlayRect } from "../../../shared/chromeBounds";

export { OVERLAY_ATTR };

export const OVERLAY_SELECTOR = `[${OVERLAY_ATTR}]`;
export const OVERLAY_CHANGE_EVENT = "lurkwire:overlays";

export function readOverlayRects(): OverlayRect[] {
  if (typeof document === "undefined") {
    return [];
  }
  const rects: OverlayRect[] = [];
  for (const node of document.querySelectorAll(OVERLAY_SELECTOR)) {
    const el = node as HTMLElement;
    const box = el.getBoundingClientRect();
    const width = el.offsetWidth || box.width;
    const height = el.offsetHeight || box.height;
    if (width <= 0 || height <= 0) {
      continue;
    }
    const style = window.getComputedStyle(el);
    const origin = style.transformOrigin.split(" ").map((value) => Number.parseFloat(value));
    rects.push(
      untransformedOverlayRect({
        visual: { x: box.x, y: box.y, width: box.width, height: box.height },
        width,
        height,
        transform: style.transform,
        originX: origin[0] || width / 2,
        originY: origin[1] || height / 2,
      }),
    );
  }
  return rects;
}

/** Re-run `onChange` whenever a marked overlay is added, removed, or resized. */
export function observeOverlays(onChange: () => void): () => void {
  let raf = 0;
  const delays: number[] = [];
  const schedule = () => {
    onChange();
    if (!raf) {
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        onChange();
        window.requestAnimationFrame(onChange);
      });
    }
    for (const id of delays) {
      window.clearTimeout(id);
    }
    delays.length = 0;
    // Menus can finish layout / animation a frame or two later than mount.
    for (const ms of [32, 80, 200]) {
      delays.push(window.setTimeout(onChange, ms));
    }
  };
  const resize = new ResizeObserver(schedule);
  const seen = new Set<Element>();
  const sync = () => {
    const next = new Set(document.querySelectorAll(OVERLAY_SELECTOR));
    for (const node of seen) {
      if (!next.has(node)) {
        resize.unobserve(node);
        seen.delete(node);
      }
    }
    for (const node of next) {
      if (!seen.has(node)) {
        resize.observe(node);
        seen.add(node);
      }
    }
    schedule();
  };
  const mutations = new MutationObserver(sync);
  mutations.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [OVERLAY_ATTR, "style", "class", "hidden"],
  });
  window.addEventListener("resize", schedule);
  window.addEventListener(OVERLAY_CHANGE_EVENT, schedule);
  sync();
  return () => {
    if (raf) {
      window.cancelAnimationFrame(raf);
    }
    for (const id of delays) {
      window.clearTimeout(id);
    }
    mutations.disconnect();
    resize.disconnect();
    window.removeEventListener("resize", schedule);
    window.removeEventListener(OVERLAY_CHANGE_EVENT, schedule);
  };
}

export function notifyOverlaysChanged(): void {
  window.dispatchEvent(new Event(OVERLAY_CHANGE_EVENT));
}
