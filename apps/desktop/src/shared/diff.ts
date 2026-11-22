export type DiffLine = { kind: "eq" | "del" | "add"; text: string };

export function lineDiff(a: string, b: string): DiffLine[] {
  const left = a.split("\n");
  const right = b.split("\n");
  const n = left.length;
  const m = right.length;
  if (n * m > 400_000) {
    const max = Math.max(n, m);
    const out: DiffLine[] = [];
    for (let i = 0; i < max; i += 1) {
      const L = left[i];
      const R = right[i];
      if (L === R) {
        out.push({ kind: "eq", text: L ?? "" });
      } else {
        if (L !== undefined) {
          out.push({ kind: "del", text: L });
        }
        if (R !== undefined) {
          out.push({ kind: "add", text: R });
        }
      }
    }
    return out;
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      out.push({ kind: "eq", text: left[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: "del", text: left[i] });
      i += 1;
    } else {
      out.push({ kind: "add", text: right[j] });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ kind: "del", text: left[i] });
    i += 1;
  }
  while (j < m) {
    out.push({ kind: "add", text: right[j] });
    j += 1;
  }
  return out;
}

export function normalizeDiffText(text: string, ignoreWhitespace: boolean): string {
  if (!ignoreWhitespace) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n");
}
