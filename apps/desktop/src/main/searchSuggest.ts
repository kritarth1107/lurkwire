export async function searchSuggest(query: string): Promise<string[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }
  try {
    const url = `https://www.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(2500),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return [];
    }
    const data: unknown = await res.json();
    if (!Array.isArray(data) || !Array.isArray(data[1])) {
      return [];
    }
    return data[1].filter((item): item is string => typeof item === "string").slice(0, 6);
  } catch {
    return [];
  }
}
