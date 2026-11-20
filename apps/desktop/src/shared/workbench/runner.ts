import type { WbSendResult } from "./types";
export type RunnerRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

export function parseRunnerData(input: string, filename = ""): RunnerRow[] {
  const trimmed = input.trim();
  if (!trimmed) {
    return [{}];
  }
  const looksJson = trimmed.startsWith("[") || trimmed.startsWith("{") || filename.toLowerCase().endsWith(".json");
  if (looksJson) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map((row) => {
      if (row && typeof row === "object") {
        const out: RunnerRow = {};
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          out[key] = String(value ?? "");
        }
        return out;
      }
      return { value: String(row) };
    });
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headers = parseCsvLine(lines[0] ?? "").map((item) => item.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: RunnerRow = {};
    headers.forEach((key, index) => {
      if (key) {
        row[key] = cols[index] ?? "";
      }
    });
    return row;
  });
}

export type RunnerSpec = {
  requestIds: string[];
  data?: RunnerRow[];
  delayMs?: number;
  stopOnFail?: boolean;
};


export type RunnerProgress = {
  index: number;
  total: number;
  requestId: string;
  name: string;
  row?: RunnerRow;
  result: WbSendResult;
};
