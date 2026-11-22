import type { ToolId } from "./types";

/** Destinations a captured HTTP request can be sent to. */
export type SendTarget = "repeater" | "intruder" | "scanner" | "comparer" | "workbench";

export type SendToAction = {
  id: SendTarget;
  label: string;
  shortcut?: string;
  tool: ToolId | "workbench";
};

export const SEND_TO_ACTIONS: SendToAction[] = [
  { id: "repeater", label: "Send to Repeater", shortcut: "Ctrl+R", tool: "repeater" },
  { id: "intruder", label: "Send to Intruder", shortcut: "Ctrl+I", tool: "intruder" },
  { id: "scanner", label: "Send to Scanner", tool: "scanner" },
  { id: "comparer", label: "Send to Comparer", tool: "comparer" },
  { id: "workbench", label: "Send to Workbench", tool: "workbench" },
];

export const FLOW_CONTEXT_ACTIONS = [
  ...SEND_TO_ACTIONS,
  { id: "copy-curl", label: "Copy as curl", shortcut: undefined },
  { id: "copy-url", label: "Copy URL", shortcut: undefined },
  { id: "add-scope", label: "Add to scope", shortcut: undefined },
] as const;

export function toolForSendTarget(target: SendTarget): ToolId | "workbench" {
  const item = SEND_TO_ACTIONS.find((action) => action.id === target);
  return item?.tool ?? "repeater";
}

export function sendToLabel(target: SendTarget): string {
  return SEND_TO_ACTIONS.find((action) => action.id === target)?.label ?? target;
}

/** Shortcut ids that should send the selected (or latest tab) flow. */
export type ToolHotkey =
  | "send-repeater"
  | "send-intruder"
  | "send-scanner"
  | "send-comparer"
  | "toggle-intercept"
  | "shortcuts";

export function hotkeyToSendTarget(hotkey: ToolHotkey): SendTarget | null {
  switch (hotkey) {
    case "send-repeater":
      return "repeater";
    case "send-intruder":
      return "intruder";
    case "send-scanner":
      return "scanner";
    case "send-comparer":
      return "comparer";
    default:
      return null;
  }
}
