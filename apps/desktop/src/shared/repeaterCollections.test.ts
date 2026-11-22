import { describe, expect, test } from "vitest";
import {
  capHistory,
  deleteRepeaterCollection,
  listRepeaterCollections,
  loadRepeaterSession,
  saveRepeaterCollection,
  saveRepeaterSession,
  setComment,
  togglePin,
  type RepeaterHistoryEntry,
  type RepeaterTabSnapshot,
} from "./repeaterCollections";
import { memoryStore } from "./localStore";

function entry(id: string, pinned = false): RepeaterHistoryEntry {
  return {
    id,
    method: "GET",
    url: `https://example.test/${id}`,
    path: `/${id}`,
    host: "example.test",
    status: 200,
    req_headers: [],
    resp_headers: [],
    pinned,
  };
}

function tab(id: string, history: RepeaterHistoryEntry[] = []): RepeaterTabSnapshot {
  return { id, name: id, url: "https://example.test/", raw: "GET / HTTP/1.1\nHost: example.test\n\n", history, selectedIndex: 0 };
}

describe("repeater collections", () => {
  test("persists a session and named collections", () => {
    const store = memoryStore();
    saveRepeaterSession([tab("a", [entry("h1")])], store);
    expect(loadRepeaterSession(store)[0]?.id).toBe("a");
    saveRepeaterCollection("login", [tab("a")], store, 1);
    expect(listRepeaterCollections(store)[0]?.name).toBe("login");
    expect(deleteRepeaterCollection(listRepeaterCollections(store)[0].id, store)).toHaveLength(0);
  });

  test("keeps pinned history when capping", () => {
    const history = [...Array.from({ length: 25 }, (_, i) => entry(`n${i}`)), entry("pin", true)];
    const capped = capHistory(history);
    expect(capped[0]?.id).toBe("pin");
    expect(capped).toHaveLength(20);
  });

  test("pins and comments a send", () => {
    const history = [entry("a"), entry("b")];
    const pinned = togglePin(history, "b");
    expect(pinned.find((item) => item.id === "b")?.pinned).toBe(true);
    expect(setComment(pinned, "b", "baseline")[1]?.comment).toBe("baseline");
  });
});
