import { describe, expect, test } from "vitest";
import { deleteFilterPreset, listFilterPresets, saveFilterPreset } from "./filterPresets";
import { memoryStore } from "./localStore";

describe("traffic filter presets", () => {
  test("saves and removes a named query", () => {
    const store = memoryStore();
    saveFilterPreset("errors", "status:5xx", store, 1);
    saveFilterPreset("login", "path:/login", store, 2);
    expect(listFilterPresets(store).map((item) => item.name)).toEqual(["login", "errors"]);
    const id = listFilterPresets(store)[0].id;
    expect(deleteFilterPreset(id, store)).toHaveLength(1);
  });
});
