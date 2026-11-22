import { describe, expect, test } from "vitest";
import { deletePayloadList, listPayloadLists, savePayloadList } from "./intruderLists";
import { memoryStore } from "./localStore";

describe("saved Intruder payload lists", () => {
  test("saves, lists, updates by name, and deletes", () => {
    const store = memoryStore();
    savePayloadList("admin", "admin\nroot", store, undefined, 1);
    savePayloadList("sqli", "' OR 1=1--", store, undefined, 2);
    expect(listPayloadLists(store).map((item) => item.name)).toEqual(["sqli", "admin"]);
    const updated = savePayloadList("admin", "admin\nroot\nguest", store, undefined, 3);
    expect(updated).toHaveLength(2);
    expect(updated.find((item) => item.name === "admin")?.text).toContain("guest");
    const id = updated.find((item) => item.name === "sqli")!.id;
    expect(deletePayloadList(id, store)).toHaveLength(1);
  });
});
