export type SecretKind =
  | "jwt"
  | "awsAccessKey"
  | "privateKey"
  | "bearer"
  | "googleApi"
  | "slack"
  | "github"
  | "generic"
  | "endpoint";

export type ExtractedItem = {
  kind: SecretKind;
  value: string;
  context: string;
  line: number;
};

const PATTERNS: { kind: SecretKind; re: RegExp }[] = [
  { kind: "privateKey", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g },
  { kind: "awsAccessKey", re: /AKIA[0-9A-Z]{16}/g },
  { kind: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { kind: "googleApi", re: /\bAIza[0-9A-Za-z\-_]{35}\b/g },
  { kind: "slack", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { kind: "github", re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: "bearer", re: /(?:Bearer|Authorization["']?\s*[:=]\s*["']Bearer)\s+([A-Za-z0-9\-._~+/]+=*)/g },
  { kind: "generic", re: /(?:api[_-]?key|secret|access[_-]?token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["']([^"']{8,})["']/gi },
];

const ENDPOINT_RE =
  /(?:(?:fetch|axios|request|get|post|put|patch|delete|graphql)\s*\(\s*|["'`])((?:https?:\/\/|\/)[A-Za-z0-9._~\-\/?#&=%+]+)["'`]/g;

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

function contextOf(source: string, index: number): string {
  const line = source.split("\n")[lineOf(source, index) - 1] ?? "";
  return line.trim().slice(0, 200);
}

export function extractJsFindings(source: string): ExtractedItem[] {
  const found: ExtractedItem[] = [];
  const seen = new Set<string>();
  const push = (item: ExtractedItem) => {
    const key = `${item.kind}:${item.value}`;
    if (seen.has(key) || item.value.length < 6) {
      return;
    }
    seen.add(key);
    found.push(item);
  };
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source))) {
      const value = (match[1] ?? match[0]).trim();
      push({ kind, value, context: contextOf(source, match.index), line: lineOf(source, match.index) });
    }
  }
  ENDPOINT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENDPOINT_RE.exec(source))) {
    const value = match[1];
    if (!value || value.startsWith("//") || value.length < 2) {
      continue;
    }
    push({ kind: "endpoint", value, context: contextOf(source, match.index), line: lineOf(source, match.index) });
  }
  return found.sort((a, b) => a.line - b.line);
}

export function endpointsOf(items: ExtractedItem[]): string[] {
  return [...new Set(items.filter((item) => item.kind === "endpoint").map((item) => item.value))];
}

export function secretsOf(items: ExtractedItem[]): ExtractedItem[] {
  return items.filter((item) => item.kind !== "endpoint");
}
