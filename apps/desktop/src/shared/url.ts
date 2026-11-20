export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function displayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function isSettingsUrl(url: string): boolean {
  return (
    url.startsWith("lurkwire://settings") ||
    url === "about:preferences" ||
    url === "about:settings"
  );
}

export function isNewTabUrl(url: string): boolean {
  return !url || url === "about:blank" || url.startsWith("lurkwire://newtab");
}
