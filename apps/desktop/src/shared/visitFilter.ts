export type VisitLike = { id: string; title: string; url: string; visitedAt: number; count: number };

export type VisitRangeId = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

export function startOfDay(ts: number, nowTimeZoneOffsetMs?: number): number {
  const date = new Date(ts);
  const offset = nowTimeZoneOffsetMs ?? 0;
  void offset;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function visitInRange(
  visitedAt: number,
  range: VisitRangeId,
  now = Date.now(),
  custom?: { from?: number; to?: number },
): boolean {
  if (range === "all") {
    return true;
  }
  const startToday = startOfDay(now);
  if (range === "today") {
    return visitedAt >= startToday && visitedAt <= now;
  }
  if (range === "yesterday") {
    return visitedAt >= startToday - 86_400_000 && visitedAt < startToday;
  }
  if (range === "7d") {
    return visitedAt >= now - 7 * 86_400_000;
  }
  if (range === "30d") {
    return visitedAt >= now - 30 * 86_400_000;
  }
  const from = custom?.from;
  const to = custom?.to;
  if (from != null && visitedAt < from) {
    return false;
  }
  if (to != null && visitedAt > to) {
    return false;
  }
  return true;
}

export function groupVisitsByDay(items: VisitLike[], now = Date.now()): { label: string; items: VisitLike[] }[] {
  const groups = new Map<string, VisitLike[]>();
  const order: string[] = [];
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  for (const item of items) {
    const day = startOfDay(item.visitedAt);
    const label =
      day === today ? "Today" : day === yesterday ? "Yesterday" : new Date(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (!groups.has(label)) {
      order.push(label);
      groups.set(label, []);
    }
    groups.get(label)!.push(item);
  }
  return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}
