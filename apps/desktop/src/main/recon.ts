import { createConnection } from "node:net";
import { promises as dns } from "node:dns";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import {
  type ReconRequest,
  type ReconResult,
  type CrtEntry,
  type DnsRecordSet,
  type WaybackEntry,
  normalizeDomain,
  parseCrtSh,
  parseWayback,
  parseWhoisReferral,
} from "../shared/recon";

export {
  normalizeDomain,
  parseCrtSh,
  parseWhoisReferral,
  type ReconRequest,
  type ReconResult,
} from "../shared/recon";


function shodanKeyPath(): string {
  return join(app.getPath("userData"), "shodan-key.bin");
}

export function hasShodanKey(): boolean {
  return existsSync(shodanKeyPath());
}

export function saveShodanKey(secret: string): void {
  const trimmed = secret.trim();
  if (!trimmed) {
    clearShodanKey();
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS key encryption is unavailable, so the Shodan key was not saved.");
  }
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(shodanKeyPath(), safeStorage.encryptString(trimmed));
}

export function clearShodanKey(): void {
  const path = shodanKeyPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function loadShodanKey(): string | null {
  const path = shodanKeyPath();
  if (!existsSync(path)) {
    return null;
  }
  try {
    return safeStorage.decryptString(readFileSync(path));
  } catch {
    return null;
  }
}

async function collect<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export async function lookupDns(domain: string): Promise<DnsRecordSet> {
  const [a, aaaa, mx, txt, ns, cname, soa, caa] = await Promise.all([
    collect(() => dns.resolve4(domain), [] as string[]),
    collect(() => dns.resolve6(domain), [] as string[]),
    collect(async () => (await dns.resolveMx(domain)).map((item) => `${item.priority} ${item.exchange}`), [] as string[]),
    collect(async () => (await dns.resolveTxt(domain)).map((item) => item.join("")), [] as string[]),
    collect(() => dns.resolveNs(domain), [] as string[]),
    collect(() => dns.resolveCname(domain), [] as string[]),
    collect(async () => {
      const record = await dns.resolveSoa(domain);
      return `${record.nsname} ${record.hostmaster}`;
    }, null as string | null),
    collect(async () => (await dns.resolveCaa(domain)).map((item) => `${item.critical} ${item.issue ?? item.iodef ?? item.issuewild ?? ""}`), [] as string[]),
  ]);
  return { a, aaaa, mx, txt, ns, cname, soa, caa };
}

async function fetchJson(url: string, timeoutMs = 20_000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Lurkwire/0.1 recon", Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text.slice(0, 180)}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("javascript")) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`unexpected response from ${url}`);
    }
  }
  return res.json();
}

async function lookupCrtSh(domain: string): Promise<CrtEntry[]> {
  const q = encodeURIComponent(`%.${domain}`);
  const data = await fetchJson(`https://crt.sh/?q=${q}&output=json`, 25_000);
  return parseCrtSh(data);
}

async function lookupRdap(domain: string): Promise<unknown> {
  return fetchJson(`https://rdap.org/domain/${encodeURIComponent(domain)}`, 15_000);
}

function whoisQuery(server: string, query: string, port = 43): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const socket = createConnection({ host: server, port }, () => {
      socket.write(`${query}\r\n`);
    });
    socket.setTimeout(12_000);
    socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`WHOIS ${server} timed out`));
    });
    socket.on("error", reject);
  });
}

async function lookupWhois(domain: string): Promise<string> {
  const tld = domain.includes(".") ? domain.split(".").pop()! : domain;
  const iana = await whoisQuery("whois.iana.org", tld);
  const refer = parseWhoisReferral(iana) ?? "whois.iana.org";
  const body = refer === "whois.iana.org" ? iana : await whoisQuery(refer, domain);
  return body.trim().slice(0, 32_000);
}

async function lookupWayback(domain: string): Promise<WaybackEntry[]> {
  const url = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}/*&output=json&fl=timestamp,original,statuscode,mimetype,length&filter=statuscode:200&collapse=urlkey&limit=40`;
  return parseWayback(await fetchJson(url, 20_000));
}

async function lookupShodan(domain: string): Promise<unknown> {
  const key = loadShodanKey();
  if (!key) {
    throw new Error("Add a Shodan API key in Settings to use this lookup.");
  }
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(domain);
  const url = isIp
    ? `https://api.shodan.io/shodan/host/${encodeURIComponent(domain)}?key=${encodeURIComponent(key)}`
    : `https://api.shodan.io/dns/domain/${encodeURIComponent(domain)}?key=${encodeURIComponent(key)}`;
  return fetchJson(url, 20_000);
}

export async function runRecon(request: ReconRequest): Promise<ReconResult> {
  const domain = normalizeDomain(request.domain);
  const wanted = new Set(request.sources ?? ["dns", "crtsh", "rdap", "whois", "wayback", "shodan"]);
  const result: ReconResult = { domain, errors: {} };
  const jobs: Array<Promise<void>> = [];

  if (wanted.has("dns")) {
    jobs.push(
      lookupDns(domain)
        .then((data) => {
          result.dns = data;
        })
        .catch((err) => {
          result.errors.dns = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  if (wanted.has("crtsh")) {
    jobs.push(
      lookupCrtSh(domain)
        .then((data) => {
          result.crtsh = data;
        })
        .catch((err) => {
          result.errors.crtsh = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  if (wanted.has("rdap")) {
    jobs.push(
      lookupRdap(domain)
        .then((data) => {
          result.rdap = data;
        })
        .catch((err) => {
          result.errors.rdap = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  if (wanted.has("whois")) {
    jobs.push(
      lookupWhois(domain)
        .then((data) => {
          result.whois = data;
        })
        .catch((err) => {
          result.errors.whois = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  if (wanted.has("wayback")) {
    jobs.push(
      lookupWayback(domain)
        .then((data) => {
          result.wayback = data;
        })
        .catch((err) => {
          result.errors.wayback = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  if (wanted.has("shodan")) {
    jobs.push(
      lookupShodan(domain)
        .then((data) => {
          result.shodan = data;
        })
        .catch((err) => {
          result.errors.shodan = err instanceof Error ? err.message : String(err);
        }),
    );
  }
  await Promise.all(jobs);
  return result;
}
