import type { HeaderPair } from "../types";

export type MatchWhere = "url" | "headers" | "body" | "anywhere";

export type MatchDirection = "request" | "response" | "both";

export type MatchRule = {
  id: string;
  enabled: boolean;
  name: string;
  match: string;
  replace: string;
  regex: boolean;
  where: MatchWhere;
  direction?: MatchDirection;
};

export type MatchTarget = {
  url: string;
  headers: HeaderPair[];
  body?: string;
};

function applyOnce(input: string, rule: MatchRule): string {
  if (!rule.match) {
    return input;
  }
  if (rule.regex) {
    try {
      return input.replace(new RegExp(rule.match, "g"), rule.replace);
    } catch {
      return input;
    }
  }
  return input.split(rule.match).join(rule.replace);
}

export function applyMatchRules(target: MatchTarget, rules: MatchRule[]): { value: MatchTarget; applied: string[] } {
  let url = target.url;
  let body = target.body ?? "";
  let headers = target.headers.map((item) => ({ ...item }));
  const applied: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.match) {
      continue;
    }
    const before = { url, body, headers: headers.map((item) => `${item.name}:${item.value}`).join("\n") };
    if (rule.where === "url" || rule.where === "anywhere") {
      url = applyOnce(url, rule);
    }
    if (rule.where === "body" || rule.where === "anywhere") {
      body = applyOnce(body, rule);
    }
    if (rule.where === "headers" || rule.where === "anywhere") {
      headers = headers.map((item) => ({
        name: applyOnce(item.name, rule),
        value: applyOnce(item.value, rule),
      }));
    }
    const after = { url, body, headers: headers.map((item) => `${item.name}:${item.value}`).join("\n") };
    if (before.url !== after.url || before.body !== after.body || before.headers !== after.headers) {
      applied.push(rule.name || rule.id);
    }
  }
  return { value: { url, headers, body: body || undefined }, applied };
}

export function rulesForDirection(rules: MatchRule[], direction: "request" | "response"): MatchRule[] {
  return rules.filter((rule) => {
    const dir = rule.direction ?? "both";
    return dir === "both" || dir === direction;
  });
}

export function applyMatchRulesFor(
  target: MatchTarget,
  rules: MatchRule[],
  direction: "request" | "response",
): { value: MatchTarget; applied: string[] } {
  return applyMatchRules(target, rulesForDirection(rules, direction));
}
