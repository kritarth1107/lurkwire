import { describe, expect, test } from "vitest";
import { groupVisitsByDay, visitInRange } from "./visitFilter";

const now = Date.parse("2026-11-22T12:00:00+05:30");

function visit(id: string, at: number) {
  return { id, title: id, url: `https://example.test/${id}`, visitedAt: at, count: 1 };
}

describe("visit date filters", () => {
  test("today, yesterday, rolling windows, and custom range", () => {
    expect(visitInRange(now - 1000, "today", now)).toBe(true);
    expect(visitInRange(now - 86_400_000 - 1000, "today", now)).toBe(false);
    expect(visitInRange(now - 86_400_000 - 1000, "yesterday", now)).toBe(true);
    expect(visitInRange(now - 3 * 86_400_000, "7d", now)).toBe(true);
    expect(visitInRange(now - 10 * 86_400_000, "7d", now)).toBe(false);
    expect(visitInRange(now - 10 * 86_400_000, "30d", now)).toBe(true);
    expect(visitInRange(now - 2000, "custom", now, { from: now - 5000, to: now - 1000 })).toBe(true);
    expect(visitInRange(now - 9000, "custom", now, { from: now - 5000, to: now - 1000 })).toBe(false);
  });

  test("groups by day labels", () => {
    const groups = groupVisitsByDay(
      [visit("a", now), visit("b", now - 86_400_000), visit("c", now - 5 * 86_400_000)],
      now,
    );
    expect(groups[0]).toMatchObject({ label: "Today", items: [{ id: "a" }] });
    expect(groups[1]).toMatchObject({ label: "Yesterday", items: [{ id: "b" }] });
    expect(groups[2]?.items[0]?.id).toBe("c");
  });
});
