import type { LlmAction } from "../../../shared/types";

export type PendingLlm = {
  action: LlmAction;
  findingId?: string;
  flowId?: string;
  raw?: string;
  title?: string;
};

let pending: PendingLlm | null = null;

export function queueLlm(next: PendingLlm): void {
  pending = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("lurkwire:llm-pending"));
  }
}

export function takeLlm(): PendingLlm | null {
  const current = pending;
  pending = null;
  return current;
}
