export const CVSS_METRICS = {
  AV: { N: 0.85, A: 0.62, L: 0.55, P: 0.2 },
  AC: { L: 0.77, H: 0.44 },
  PR: {
    U: { N: 0.85, L: 0.62, H: 0.27 },
    C: { N: 0.85, L: 0.68, H: 0.5 },
  },
  UI: { N: 0.85, R: 0.62 },
  S: { U: 1, C: 1 },
  CIA: { H: 0.56, L: 0.22, N: 0 },
} as const;

export type Av = keyof typeof CVSS_METRICS.AV;
export type Ac = keyof typeof CVSS_METRICS.AC;
export type Pr = "N" | "L" | "H";
export type Ui = keyof typeof CVSS_METRICS.UI;
export type ScopeChange = "U" | "C";
export type Cia = keyof typeof CVSS_METRICS.CIA;

export type CvssVector = {
  AV: Av;
  AC: Ac;
  PR: Pr;
  UI: Ui;
  S: ScopeChange;
  C: Cia;
  I: Cia;
  A: Cia;
};

export type CvssResult = {
  score: number;
  severity: "None" | "Low" | "Medium" | "High" | "Critical";
  vector: string;
  impact: number;
  exploitability: number;
};

export const DEFAULT_CVSS: CvssVector = {
  AV: "N",
  AC: "L",
  PR: "N",
  UI: "N",
  S: "U",
  C: "H",
  I: "H",
  A: "H",
};

function roundUp(value: number): number {
  return Math.ceil(value * 10 - 1e-9) / 10;
}

export function severityFromScore(score: number): CvssResult["severity"] {
  if (score === 0) {
    return "None";
  }
  if (score <= 3.9) {
    return "Low";
  }
  if (score <= 6.9) {
    return "Medium";
  }
  if (score <= 8.9) {
    return "High";
  }
  return "Critical";
}

export function formatCvssVector(metrics: CvssVector): string {
  return `CVSS:3.1/AV:${metrics.AV}/AC:${metrics.AC}/PR:${metrics.PR}/UI:${metrics.UI}/S:${metrics.S}/C:${metrics.C}/I:${metrics.I}/A:${metrics.A}`;
}

export function parseCvssVector(input: string): CvssVector | null {
  const text = input.trim().toUpperCase().replace(/^CVSS:3\.[01]\//, "");
  const parts = Object.fromEntries(
    text
      .split("/")
      .map((part) => part.split(":"))
      .filter((pair) => pair.length === 2),
  ) as Record<string, string>;
  const metrics: CvssVector = { ...DEFAULT_CVSS };
  const assign = <K extends keyof CvssVector>(key: K, allowed: readonly string[]): void => {
    const value = parts[key];
    if (value && allowed.includes(value)) {
      metrics[key] = value as CvssVector[K];
    }
  };
  assign("AV", ["N", "A", "L", "P"]);
  assign("AC", ["L", "H"]);
  assign("PR", ["N", "L", "H"]);
  assign("UI", ["N", "R"]);
  assign("S", ["U", "C"]);
  assign("C", ["H", "L", "N"]);
  assign("I", ["H", "L", "N"]);
  assign("A", ["H", "L", "N"]);
  return metrics;
}

export function scoreCvss(metrics: CvssVector): CvssResult {
  const iss = 1 - (1 - CVSS_METRICS.CIA[metrics.C]) * (1 - CVSS_METRICS.CIA[metrics.I]) * (1 - CVSS_METRICS.CIA[metrics.A]);
  const impact =
    metrics.S === "U"
      ? 6.42 * iss
      : 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15;
  const pr = CVSS_METRICS.PR[metrics.S][metrics.PR];
  const exploitability = 8.22 * CVSS_METRICS.AV[metrics.AV] * CVSS_METRICS.AC[metrics.AC] * pr * CVSS_METRICS.UI[metrics.UI];
  let score = 0;
  if (impact > 0) {
    score = metrics.S === "U" ? roundUp(Math.min(impact + exploitability, 10)) : roundUp(Math.min(1.08 * (impact + exploitability), 10));
  }
  return {
    score,
    severity: severityFromScore(score),
    vector: formatCvssVector(metrics),
    impact,
    exploitability,
  };
}
