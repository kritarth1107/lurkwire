import type { ScopeRule } from "./types";

export function hostMatches(pattern: string, host: string): boolean {
  const normalizedPattern = pattern.trim().replace(/\.$/, "").toLowerCase();
  const normalizedHost = host.trim().replace(/\.$/, "").toLowerCase();
  if (!normalizedPattern || normalizedPattern === "*") {
    return true;
  }
  if (normalizedPattern.startsWith("*.")) {
    const rest = normalizedPattern.slice(2);
    return normalizedHost === rest || normalizedHost.endsWith(`.${rest}`);
  }
  return normalizedHost === normalizedPattern;
}

function pathMatches(prefix: string, path: string): boolean {
  if (prefix === "/" || prefix === "") {
    return true;
  }
  const current = path || "/";
  return current === prefix || (current.startsWith(prefix) && (prefix.endsWith("/") || current.slice(prefix.length).startsWith("/")));
}

export function scopeRuleMatches(rule: Pick<ScopeRule, "enabled" | "host" | "port" | "path_prefix">, host: string, port: number, path: string): boolean {
  if (!rule.enabled) {
    return false;
  }
  if (rule.port != null && rule.port !== port) {
    return false;
  }
  if (!hostMatches(rule.host, host)) {
    return false;
  }
  return pathMatches(rule.path_prefix || "/", path);
}

export function isPassivelyInScope(rules: ScopeRule[], host: string, port: number, path: string): boolean {
  const enabled = rules.filter((rule) => rule.enabled);
  if (!enabled.some((rule) => rule.kind === "include")) {
    return true;
  }
  if (enabled.some((rule) => rule.kind === "exclude" && scopeRuleMatches(rule, host, port, path))) {
    return false;
  }
  return enabled.some((rule) => rule.kind === "include" && scopeRuleMatches(rule, host, port, path));
}

/** Active tools are default-deny until an include matches. */
export function activeAllowed(rules: ScopeRule[], host: string, port: number, path: string): boolean {
  const enabled = rules.filter((rule) => rule.enabled);
  if (!enabled.some((rule) => rule.kind === "include")) {
    return false;
  }
  if (enabled.some((rule) => rule.kind === "exclude" && scopeRuleMatches(rule, host, port, path))) {
    return false;
  }
  return enabled.some((rule) => rule.kind === "include" && scopeRuleMatches(rule, host, port, path));
}

export function parseTarget(url: string): { host: string; port: number; path: string; scheme: string } {
  const parsed = new URL(url);
  const scheme = parsed.protocol.replace(":", "");
  const port = parsed.port ? Number(parsed.port) : scheme === "https" || scheme === "wss" ? 443 : 80;
  return { host: parsed.hostname, port, path: parsed.pathname || "/", scheme };
}

export function assertActiveAllowed(rules: ScopeRule[], url: string): void {
  const target = parseTarget(url);
  if (!activeAllowed(rules, target.host, target.port, target.path)) {
    throw new Error(`Active tools cannot reach ${target.host}${target.path} because it is out of scope. Add an include rule and retry.`);
  }
}
