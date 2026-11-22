import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { computeAnchoredPosition } from "../../../shared/anchorPopover";
import { popoverMotionStyle } from "../../../shared/popoverMotion";

export function Tooltip({
  label,
  shortcut,
  extra,
  delay = 420,
  children,
}: {
  label: string;
  shortcut?: string;
  extra?: string;
  delay?: number;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    align: "start" | "end";
    placement: "below" | "above";
  } | null>(null);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const show = () => {
    clear();
    timer.current = window.setTimeout(() => {
      const node = wrapRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      setPos(
        computeAnchoredPosition({
          trigger: rect,
          width: Math.max(160, Math.min(280, label.length * 8 + 48)),
          height: extra ? 52 : 30,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          align: "start",
          placement: "below",
          gap: 6,
          margin: 8,
        }),
      );
      setOpen(true);
    }, delay);
  };

  const hide = () => {
    clear();
    setOpen(false);
    setPos(null);
  };

  useEffect(() => () => clear(), []);

  return (
    <>
      <span
        className="lw-tooltip-wrap"
        ref={wrapRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && pos
        ? createPortal(
            <div className="lw-tooltip" data-lw-overlay="" role="tooltip" style={popoverMotionStyle(pos)}>
              <span className="lw-tooltip-row">
                <span>{label}</span>
                {shortcut ? <kbd>{shortcut}</kbd> : null}
              </span>
              {extra ? <span className="lw-tooltip-extra">{extra}</span> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function formatMemory(bytes: number): string {
  if (!bytes) {
    return "";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
