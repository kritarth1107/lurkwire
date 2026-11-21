import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, PanelOpenRequest } from "../../../shared/types";
import { computeAnchoredPosition } from "../../../shared/anchorPopover";
import { PanelView } from "./Panels";

const MARGIN = 8;

export function PanelHost({ state }: { state: AppSnapshot }) {
  const [request, setRequest] = useState<PanelOpenRequest | null>(null);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 1280 : window.innerWidth,
    height: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useEffect(() => {
    const offShow = window.lurkwire.onShowPanel((next) => {
      setRequest(next);
      setMeasured(null);
    });
    const offHide = window.lurkwire.onHidePanel(() => {
      setRequest(null);
      setMeasured(null);
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void window.lurkwire.closePanel();
      }
    };
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      offShow();
      offHide();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useLayoutEffect(() => {
    const node = panelRef.current;
    if (!node || !request) {
      return;
    }
    const report = () => {
      const rect = node.getBoundingClientRect();
      setMeasured({ width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [request]);

  const width = measured?.width ?? request?.width ?? 280;
  const height = measured?.height ?? request?.height ?? 320;
  const position = useMemo(() => {
    if (!request?.anchor) {
      return null;
    }
    return computeAnchoredPosition({
      trigger: request.anchor,
      width,
      height,
      viewport,
      align: request.align,
      placement: request.placement,
      margin: MARGIN,
    });
  }, [request, width, height, viewport]);

  if (!request || !position) {
    return null;
  }

  const maxHeight = Math.max(80, viewport.height - MARGIN * 2);

  return (
    <>
      <div
        className="anchored-popover-backdrop"
        data-testid="anchored-popover-backdrop"
        onMouseDown={(event) => {
          event.preventDefault();
          void window.lurkwire.closePanel();
        }}
      />
      <div
        ref={panelRef}
        className="anchored-popover"
        data-testid="anchored-popover"
        data-kind={request.kind}
        role="menu"
        style={{
          left: position.left,
          top: position.top,
          width: request.width,
          maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
          maxHeight,
        }}
      >
        <PanelView ctx={{ kind: request.kind, payload: request.payload ?? {} }} state={state} />
      </div>
    </>
  );
}
