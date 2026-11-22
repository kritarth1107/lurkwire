import { describe, expect, it } from "vitest";
import { PENTEST_TOOLS } from "./toolsCatalog";
import {
  DEFAULT_PINNED_TOOLS,
  TOOL_MENU_GROUPS,
  allToolMenuItems,
  filterAllMenus,
  groupForPanel,
  menuItemById,
  sanitizePinnedTools,
  togglePinned,
  ungroupedCatalogTools,
} from "./toolMenus";

describe("categorized tool menus", () => {
  it("groups every catalog tool into a labelled menu", () => {
    expect(ungroupedCatalogTools()).toEqual([]);
    expect(TOOL_MENU_GROUPS.map((group) => group.id)).toEqual([
      "proxy",
      "attack",
      "recon",
      "decode",
      "report",
    ]);
    expect(TOOL_MENU_GROUPS.map((group) => group.label)).toEqual([
      "Proxy",
      "Attack",
      "Recon",
      "Decode",
      "Report",
    ]);
  });

  it("routes JWT and CVSS aliases to existing panels and CORS to its own panel", () => {
    expect(menuItemById("jwt")?.panel).toBe("decode");
    expect(menuItemById("jwt")?.intent).toBe("jwt");
    expect(menuItemById("cvss")?.panel).toBe("notes");
    expect(menuItemById("cvss")?.intent).toBe("cvss");
    expect(menuItemById("cors")?.panel).toBe("cors");
    expect(groupForPanel("history")?.id).toBe("proxy");
    expect(groupForPanel("repeater")?.id).toBe("attack");
    expect(groupForPanel("sitemap")?.id).toBe("recon");
    expect(groupForPanel("cookies")?.id).toBe("decode");
    expect(groupForPanel("report")?.id).toBe("report");
  });

  it("pins the most-used tools for 1-click access", () => {
    expect(DEFAULT_PINNED_TOOLS).toEqual([
      "history",
      "intercept",
      "repeater",
      "intruder",
      "scanner",
    ]);
    expect(sanitizePinnedTools(["history", "cors", "nope"])).toEqual(["history", "cors"]);
    expect(sanitizePinnedTools("nope")).toEqual(DEFAULT_PINNED_TOOLS);
    expect(togglePinned(["history"], "repeater")).toEqual(["history", "repeater"]);
    expect(togglePinned(["history", "repeater"], "repeater")).toEqual(["history"]);
  });

  it("filters menu items for in-menu search and Ctrl+K still covers the catalog", () => {
    const jwt = filterAllMenus("jwt");
    expect(jwt.some((item) => item.id === "jwt")).toBe(true);
    expect(filterAllMenus("smuggl").some((item) => item.panel === "smuggling")).toBe(true);
    const catalogIds = new Set(PENTEST_TOOLS.map((item) => item.id));
    for (const item of allToolMenuItems()) {
      expect(catalogIds.has(item.panel)).toBe(true);
    }
  });

  it("keeps intercept and send-to shortcuts on the matching items", () => {
    expect(menuItemById("intercept")?.shortcut).toBe("Ctrl+Shift+I");
    expect(menuItemById("repeater")?.shortcut).toBe("Ctrl+R");
    expect(menuItemById("intruder")?.shortcut).toBe("Ctrl+I");
  });
});
