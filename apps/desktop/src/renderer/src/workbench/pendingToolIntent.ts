import type { ToolIntent } from "../../../shared/toolMenus";

let pending: ToolIntent | null = null;

export function queueToolIntent(intent?: ToolIntent): void {
  pending = intent ?? null;
}

export function takeToolIntent(): ToolIntent | null {
  const next = pending;
  pending = null;
  return next;
}
