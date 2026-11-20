export type TokenStats = {
  count: number;
  unique: number;
  minLen: number;
  maxLen: number;
  meanLen: number;
  charset: string;
  charsetSize: number;
  entropy: number;
  maxEntropy: number;
  incremental: boolean;
  numeric: boolean;
  hexLike: boolean;
  base64Like: boolean;
  timestampLike: boolean;
  notes: string[];
};

function charsetOf(tokens: string[]): string {
  const set = new Set<string>();
  for (const token of tokens) {
    for (const ch of token) {
      set.add(ch);
    }
  }
  return [...set].sort().join("");
}

export function shannonEntropy(tokens: string[]): number {
  if (tokens.length === 0) {
    return 0;
  }
  const blob = tokens.join("");
  if (!blob) {
    return 0;
  }
  const freq = new Map<string, number>();
  for (const ch of blob) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1);
  }
  let h = 0;
  for (const count of freq.values()) {
    const p = count / blob.length;
    h -= p * Math.log2(p);
  }
  return h;
}

function isIncremental(tokens: string[]): boolean {
  if (tokens.length < 3) {
    return false;
  }
  const nums = tokens.map((t) => Number(t));
  if (nums.every((n) => Number.isFinite(n))) {
    const steps = nums.slice(1).map((n, i) => n - nums[i]);
    return steps.every((s) => s === steps[0] && s !== 0);
  }
  if (tokens.every((t) => t.length === tokens[0].length && t.length > 0)) {
    const codes = tokens.map((t) => {
      let n = 0n;
      for (const ch of t) {
        n = (n << 16n) + BigInt(ch.charCodeAt(0));
      }
      return n;
    });
    const steps = codes.slice(1).map((n, i) => n - codes[i]);
    return steps.every((s) => s === steps[0] && s !== 0n);
  }
  return false;
}

export function analyzeTokens(input: string): TokenStats {
  const tokens = input
    .split(/\s+/g)
    .map((t) => t.trim())
    .filter(Boolean);
  const lengths = tokens.map((t) => t.length);
  const unique = new Set(tokens).size;
  const charset = charsetOf(tokens);
  const entropy = shannonEntropy(tokens);
  const maxEntropy = charset.length ? Math.log2(charset.length) : 0;
  const numeric = tokens.length > 0 && tokens.every((t) => /^-?\d+$/.test(t));
  const hexLike = tokens.length > 0 && tokens.every((t) => /^[0-9a-fA-F]+$/.test(t) && t.length >= 8);
  const base64Like =
    tokens.length > 0 &&
    tokens.every((t) => /^[A-Za-z0-9+/=_-]+$/.test(t) && t.length >= 8) &&
    !hexLike &&
    !numeric;
  const timestampLike =
    tokens.length > 0 &&
    tokens.every((t) => /^\d{10,13}$/.test(t));
  const incremental = isIncremental(tokens);
  const notes: string[] = [];
  if (tokens.length === 0) {
    notes.push("Paste tokens, one per line or whitespace-separated.");
  } else if (unique === 1) {
    notes.push("Every sample is identical — no entropy in this set.");
  } else if (incremental) {
    notes.push("Values look incremental or sequential, so they are likely predictable.");
  } else if (timestampLike) {
    notes.push("Values look like Unix timestamps.");
  } else if (entropy >= maxEntropy * 0.9 && tokens[0].length >= 16 && unique === tokens.length) {
    notes.push("High per-character entropy and no repeats — closer to random.");
  } else if (entropy < 3) {
    notes.push("Low entropy — the charset or structure may be predictable.");
  }
  const meanLen = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
  return {
    count: tokens.length,
    unique,
    minLen: lengths.length ? Math.min(...lengths) : 0,
    maxLen: lengths.length ? Math.max(...lengths) : 0,
    meanLen,
    charset,
    charsetSize: charset.length,
    entropy,
    maxEntropy,
    incremental,
    numeric,
    hexLike,
    base64Like,
    timestampLike,
    notes,
  };
}
