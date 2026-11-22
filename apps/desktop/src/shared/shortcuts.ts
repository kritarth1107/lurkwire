export type ShortcutEntry = {
  id: string;
  keys: string;
  action: string;
  group: "Tools" | "Browser" | "Editor";
};

export const SHORTCUTS: ShortcutEntry[] = [
  { id: "send-repeater", keys: "Ctrl+R", action: "Send selected or latest request to Repeater", group: "Tools" },
  { id: "send-intruder", keys: "Ctrl+I", action: "Send selected or latest request to Intruder", group: "Tools" },
  { id: "toggle-intercept", keys: "Ctrl+Shift+I", action: "Toggle intercept (pause traffic)", group: "Tools" },
  { id: "repeater-send", keys: "Ctrl+Enter", action: "Send / resend in Repeater", group: "Editor" },
  { id: "palette", keys: "Ctrl+K", action: "Open the command palette", group: "Tools" },
  { id: "shortcuts", keys: "Ctrl+/", action: "Show keyboard shortcuts", group: "Tools" },
  { id: "reload", keys: "F5", action: "Reload this tab", group: "Browser" },
  { id: "devtools", keys: "F12", action: "Open developer tools", group: "Browser" },
  { id: "focus-url", keys: "Ctrl+L", action: "Focus the address bar", group: "Browser" },
  { id: "new-tab", keys: "Ctrl+T", action: "New tab", group: "Browser" },
  { id: "find", keys: "Ctrl+F", action: "Find in page", group: "Browser" },
  { id: "history", keys: "Ctrl+H", action: "Browsing history", group: "Browser" },
  { id: "downloads", keys: "Ctrl+J", action: "Downloads", group: "Browser" },
  { id: "all-tabs", keys: "Ctrl+Shift+A", action: "Search and manage tabs", group: "Browser" },
];

export function shortcutFor(id: string): string | undefined {
  return SHORTCUTS.find((item) => item.id === id)?.keys;
}
