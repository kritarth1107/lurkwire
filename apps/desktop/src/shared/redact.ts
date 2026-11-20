export type RedactResult = {
  text: string;
  redacted: boolean;
};

const PATTERNS: { name: string; re: RegExp }[] = [
  { name: "auth", re: /(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi },
  { name: "api-key-header", re: /((?:x-api-key|api-key|apikey)\s*[:=]\s*)[^\s,;]+/gi },
  { name: "cookie", re: /(cookie\s*[:=]\s*)[^\r\n]+/gi },
  { name: "set-cookie", re: /(set-cookie\s*[:=]\s*)[^\r\n]+/gi },
  { name: "password", re: /("password"\s*:\s*")[^"]+/gi },
  { name: "secret", re: /("(?:secret|token|access_token|refresh_token|id_token|client_secret)"\s*:\s*")[^"]+/gi },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { name: "aws", re: /\b(AKIA[0-9A-Z]{16})\b/g },
  { name: "email", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
];

export function redactForCloud(input: string): RedactResult {
  let text = input;
  let redacted = false;
  for (const pattern of PATTERNS) {
    const next = text.replace(pattern.re, (match, prefix?: string) => {
      redacted = true;
      if (typeof prefix === "string" && match.toLowerCase().startsWith(prefix.toLowerCase())) {
        return `${prefix}[REDACTED]`;
      }
      return "[REDACTED]";
    });
    text = next;
  }
  return { text, redacted };
}

export function isLocalLlmUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "::1" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}
