import { describe, expect, it } from "vitest";
import {
  groupLabel,
  nextTabGroupColor,
  packTabOrder,
  tabStripSegments,
  type TabGroup,
} from "./tabGroups";

describe("tab groups", () => {
  it("picks the next unused Chrome color", () => {
    expect(nextTabGroupColor([])).toBe("grey");
    expect(nextTabGroupColor(["grey", "blue"])).toBe("red");
  });

  it("packs group members into a single contiguous range", () => {
    const groupOf = (id: string) => (id === "b" || id === "d" ? "g1" : null);
    expect(packTabOrder(["a", "b", "c", "d", "e"], groupOf)).toEqual(["a", "b", "d", "c", "e"]);
  });

  it("builds strip segments and labels unnamed groups", () => {
    const groups: TabGroup[] = [
      { id: "g1", title: "Work", color: "blue", collapsed: false },
      { id: "g2", title: "", color: "red", collapsed: true },
    ];
    const tabs = [
      { id: "a", groupId: null },
      { id: "b", groupId: "g1" },
      { id: "c", groupId: "g1" },
      { id: "d", groupId: "g2" },
    ];
    const segs = tabStripSegments(tabs, groups);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ kind: "tabs", tabs: [{ id: "a" }] });
    expect(segs[1]).toMatchObject({ kind: "group", group: { id: "g1" } });
    expect(groupLabel(groups[1]!)).toBe("Group");
  });
});
