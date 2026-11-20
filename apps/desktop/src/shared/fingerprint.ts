export function normalizeFingerprint(value: string): string {
  return value.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export function fingerprintsMatch(left: string, right: string): boolean {
  const a = normalizeFingerprint(left);
  const b = normalizeFingerprint(right);
  return a.length > 0 && a === b;
}
