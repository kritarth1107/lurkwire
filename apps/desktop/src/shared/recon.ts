export type DnsRecordSet = {
  a: string[];
  aaaa: string[];
  mx: string[];
  txt: string[];
  ns: string[];
  cname: string[];
  soa: string | null;
  caa: string[];
};

export type CrtEntry = {
  id: number | string;
  commonName: string;
  names: string[];
  issuer: string;
  notBefore: string;
  notAfter: string;
};

export type WaybackEntry = {
  timestamp: string;
  original: string;
  status: string;
  mime: string;
  length: string;
};

export type ReconResult = {
  domain: string;
  dns?: DnsRecordSet;
  crtsh?: CrtEntry[];
  rdap?: unknown;
  whois?: string;
  wayback?: WaybackEntry[];
  shodan?: unknown;
  errors: Record<string, string>;
};

export type ReconSource = "dns" | "crtsh" | "rdap" | "whois" | "wayback" | "shodan";

export type ReconRequest = {
  domain: string;
  sources?: ReconSource[];
};

export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) {
    throw new Error("Enter a domain or hostname.");
  }
  if (value.includes("://")) {
    value = new URL(value).hostname;
  }
  value = value.replace(/\.$/, "").replace(/^www\./, "");
  if (value.includes("/")) {
    value = value.split("/")[0] ?? value;
  }
  if (value.includes(":") && !value.startsWith("[")) {
    value = value.split(":")[0] ?? value;
  }
  if (!/^[a-z0-9._-]+$/.test(value) && !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    throw new Error("That does not look like a hostname or IPv4 address.");
  }
  return value;
}

export function parseWhoisReferral(text: string): string | null {
  const match = text.match(/^\s*(?:refer|whois|whois server)\s*:\s*(\S+)/im);
  return match?.[1]?.replace(/\.$/, "") ?? null;
}

export function parseCrtSh(data: unknown): CrtEntry[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const seen = new Map<string, CrtEntry>();
  for (const row of data) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const rec = row as Record<string, unknown>;
    const names = String(rec.name_value ?? "")
      .split("\n")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    const commonName = String(rec.common_name ?? names[0] ?? "");
    const key = `${commonName}|${names.sort().join(",")}|${rec.issuer_name}|${rec.not_before}|${rec.not_after}`;
    if (seen.has(key)) {
      continue;
    }
    seen.set(key, {
      id: (rec.id as number | string | undefined) ?? key,
      commonName,
      names,
      issuer: String(rec.issuer_name ?? ""),
      notBefore: String(rec.not_before ?? ""),
      notAfter: String(rec.not_after ?? ""),
    });
  }
  return [...seen.values()].slice(0, 200);
}

export function parseWayback(data: unknown): WaybackEntry[] {
  if (!Array.isArray(data) || data.length < 2) {
    return [];
  }
  const rows = data.slice(1) as unknown[];
  const out: WaybackEntry[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) {
      continue;
    }
    out.push({
      timestamp: String(row[0] ?? ""),
      original: String(row[1] ?? ""),
      status: String(row[2] ?? ""),
      mime: String(row[3] ?? ""),
      length: String(row[4] ?? ""),
    });
  }
  return out;
}
