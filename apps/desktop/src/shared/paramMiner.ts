/** Common hidden parameter names used by a param miner. */
export const HIDDEN_PARAM_WORDLIST = [
  "id", "debug", "admin", "test", "dev", "staging", "redirect", "url", "next", "return", "returnUrl",
  "callback", "cb", "dest", "destination", "continue", "target", "r", "u", "ref", "referrer",
  "token", "auth", "access_token", "api_key", "apikey", "key", "secret", "role", "user", "uid",
  "account", "org", "tenant", "company", "preview", "draft", "edit", "format", "json", "callback_url",
  "include", "fields", "sort", "order", "filter", "q", "query", "search", "s", "page", "limit",
  "offset", "lang", "locale", "theme", "mode", "verbose", "trace", "source", "from", "to",
  "file", "path", "dir", "cmd", "exec", "template", "view", "layout", "callback", "jsonp",
  "access", "privilege", "isadmin", "is_admin", "sudo", "impersonate", "as",
];

export type ParamObservation = {
  name: string;
  url: string;
  status: number | null;
  length: number;
  delta: number;
  interesting: boolean;
  flowId?: string;
  error?: string;
};

export function appendParam(url: string, name: string, value = "1"): string {
  const parsed = new URL(url);
  if (parsed.searchParams.has(name)) {
    return url;
  }
  parsed.searchParams.append(name, value);
  return parsed.toString();
}

export function alreadyPresent(url: string, name: string): boolean {
  try {
    return new URL(url).searchParams.has(name);
  } catch {
    return false;
  }
}

export function isInterestingParam(baseline: { status: number | null; length: number }, next: { status: number | null; length: number }): boolean {
  if (next.status !== baseline.status) {
    return true;
  }
  const delta = Math.abs((next.length ?? 0) - (baseline.length ?? 0));
  return delta >= 8;
}

export function planParamProbes(url: string, names: string[] = HIDDEN_PARAM_WORDLIST): string[] {
  return names.filter((name) => name && !alreadyPresent(url, name));
}

export function scoreParamHit(baselineLen: number, length: number): number {
  return Math.abs(length - baselineLen);
}
