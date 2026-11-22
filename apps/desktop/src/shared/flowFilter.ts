/** Proxy-history filter DSL shared by Traffic and unit tests. */

export type FlowFilter = {
  fts: string;
  method?: string;
  host?: string;
  path?: string;
  mime?: string;
  source?: string;
  scheme?: string;
  status?: number;
  statusMin?: number;
  statusMax?: number;
  inScope?: boolean;
  hasNote?: boolean;
};

export const FILTER_DSL_HINT =
  'method:GET status:2xx host:example path:/login mime:json source:browser scheme:https scope:yes has:note';

const STATUS_CLASS: Record<string, [number, number]> = {
  "1xx": [100, 199],
  "2xx": [200, 299],
  "3xx": [300, 399],
  "4xx": [400, 499],
  "5xx": [500, 599],
};

export function tokenizeFilter(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (/\s/.test(ch) && !inQuotes) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function applyStatus(filter: FlowFilter, value: string): void {
  const klass = STATUS_CLASS[value.toLowerCase()];
  if (klass) {
    filter.statusMin = klass[0];
    filter.statusMax = klass[1];
    return;
  }
  if (value.startsWith(">=")) {
    const n = Number(value.slice(2));
    if (Number.isFinite(n)) {
      filter.statusMin = n;
    }
    return;
  }
  if (value.startsWith("<=")) {
    const n = Number(value.slice(2));
    if (Number.isFinite(n)) {
      filter.statusMax = n;
    }
    return;
  }
  const dash = value.indexOf("-");
  if (dash > 0) {
    const min = Number(value.slice(0, dash));
    const max = Number(value.slice(dash + 1));
    if (Number.isFinite(min) && Number.isFinite(max)) {
      filter.statusMin = min;
      filter.statusMax = max;
      return;
    }
  }
  const n = Number(value);
  if (Number.isFinite(n)) {
    filter.status = n;
  }
}

export function parseFlowFilter(input: string): FlowFilter {
  const filter: FlowFilter = { fts: "" };
  const fts: string[] = [];
  for (const token of tokenizeFilter(input.trim())) {
    const lower = token.toLowerCase();
    if (lower === "in-scope" || lower === "scope:yes" || lower === "scope:in") {
      filter.inScope = true;
      continue;
    }
    if (lower === "out-of-scope" || lower === "scope:no" || lower === "scope:out") {
      filter.inScope = false;
      continue;
    }
    const colon = token.indexOf(":");
    if (colon > 0) {
      const key = token.slice(0, colon).toLowerCase();
      const value = token.slice(colon + 1);
      if (!value) {
        fts.push(token);
        continue;
      }
      if (key === "host") {
        filter.host = value;
        continue;
      }
      if (key === "method") {
        filter.method = value.toUpperCase();
        continue;
      }
      if (key === "status") {
        applyStatus(filter, value);
        continue;
      }
      if (key === "path") {
        filter.path = value;
        continue;
      }
      if (key === "mime") {
        filter.mime = value;
        continue;
      }
      if (key === "source") {
        filter.source = value;
        continue;
      }
      if (key === "scheme") {
        filter.scheme = value.toLowerCase();
        continue;
      }
      if (key === "scope") {
        const v = value.toLowerCase();
        if (v === "yes" || v === "in" || v === "true") {
          filter.inScope = true;
        } else if (v === "no" || v === "out" || v === "false") {
          filter.inScope = false;
        }
        continue;
      }
      if (key === "has") {
        if (value.toLowerCase() === "note") {
          filter.hasNote = true;
        }
        continue;
      }
    }
    fts.push(token);
  }
  filter.fts = fts.join(" ");
  return filter;
}

export function describeFlowFilter(filter: FlowFilter): string[] {
  const chips: string[] = [];
  if (filter.method) {
    chips.push(`method ${filter.method}`);
  }
  if (filter.host) {
    chips.push(`host ${filter.host}`);
  }
  if (filter.path) {
    chips.push(`path ${filter.path}`);
  }
  if (filter.mime) {
    chips.push(`mime ${filter.mime}`);
  }
  if (filter.source) {
    chips.push(`source ${filter.source}`);
  }
  if (filter.scheme) {
    chips.push(`scheme ${filter.scheme}`);
  }
  if (filter.status != null) {
    chips.push(`status ${filter.status}`);
  } else if (filter.statusMin != null || filter.statusMax != null) {
    chips.push(`status ${filter.statusMin ?? "*"}–${filter.statusMax ?? "*"}`);
  }
  if (filter.inScope === true) {
    chips.push("in scope");
  }
  if (filter.inScope === false) {
    chips.push("out of scope");
  }
  if (filter.hasNote) {
    chips.push("has note");
  }
  if (filter.fts) {
    chips.push(`text ${filter.fts}`);
  }
  return chips;
}

/** Quote FTS5 tokens that would otherwise be parsed as operators. */
export function escapeFtsQuery(terms: string): string {
  return tokenizeFilter(terms)
    .map((token) => {
      if (/^[A-Za-z0-9_]+$/.test(token)) {
        return token;
      }
      return `"${token.replace(/"/g, '""')}"`;
    })
    .join(" ");
}
