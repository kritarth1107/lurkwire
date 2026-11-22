import { describe, expect, it } from "vitest";
import {
  FLOW_CONTEXT_ACTIONS,
  SEND_TO_ACTIONS,
  hotkeyToSendTarget,
  sendToLabel,
  toolForSendTarget,
} from "./sendTo";

describe("send-to routing", () => {
  it("maps every send target to a real tool", () => {
    expect(toolForSendTarget("repeater")).toBe("repeater");
    expect(toolForSendTarget("intruder")).toBe("intruder");
    expect(toolForSendTarget("scanner")).toBe("scanner");
    expect(toolForSendTarget("comparer")).toBe("comparer");
    expect(toolForSendTarget("workbench")).toBe("workbench");
  });

  it("exposes the Burp-like menu entries a pentester expects", () => {
    const labels = FLOW_CONTEXT_ACTIONS.map((item) => item.label);
    expect(labels).toEqual([
      "Send to Repeater",
      "Send to Intruder",
      "Send to Scanner",
      "Send to Comparer",
      "Send to Workbench",
      "Copy as curl",
      "Copy as fetch",
      "Copy URL",
      "Add to scope",
    ]);
    expect(SEND_TO_ACTIONS.find((item) => item.id === "repeater")?.shortcut).toBe("Ctrl+R");
    expect(SEND_TO_ACTIONS.find((item) => item.id === "intruder")?.shortcut).toBe("Ctrl+I");
  });

  it("routes tool hotkeys to the matching destination", () => {
    expect(hotkeyToSendTarget("send-repeater")).toBe("repeater");
    expect(hotkeyToSendTarget("send-intruder")).toBe("intruder");
    expect(hotkeyToSendTarget("send-scanner")).toBe("scanner");
    expect(hotkeyToSendTarget("toggle-intercept")).toBeNull();
    expect(sendToLabel("repeater")).toBe("Send to Repeater");
  });
});
