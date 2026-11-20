import { promises as dns } from "node:dns";
import { connect as tlsConnect, type PeerCertificate } from "node:tls";
import type { Session } from "electron";
import type { FlowDetail, FlowList, HeaderPair } from "../shared/types";
import { isInternalUrl } from "../shared/url";
import type { SiteCertificate, SiteCookie, SiteInfo } from "../shared/siteInfo";
import { listPermissions } from "./permissions";

const TECH_HEADERS = [
  "server",
  "x-powered-by",
  "x-aspnet-version",
  "x-generator",
  "via",
  "x-cdn",
  "cf-ray",
  "x-vercel-id",
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
];

export async function collectSiteInfo(
  rawUrl: string,
  opts: {
    session?: Session | null;
    listFlows?: (host: string) => Promise<FlowList>;
    getFlow?: (id: string) => Promise<FlowDetail>;
  },
): Promise<SiteInfo> {
  const url = rawUrl.trim();
  let host = "";
  let origin = "";
  let secure = false;
  try {
    const parsed = new URL(url.includes("://") ? url : `https://${url}`);
    host = parsed.hostname;
    origin = parsed.origin;
    secure = parsed.protocol === "https:";
  } catch {
    host = url;
  }
  const internal = !url || isInternalUrl(url);
  const certPromise =
    !internal && host && secure ? readCertificate(host, 443) : Promise.resolve([null, null] as const);
  const [certResult, cookies, intelBase] = await Promise.all([
    certPromise,
    opts.session && origin && !internal ? readCookies(opts.session, url) : Promise.resolve([]),
    gatherDns(host),
  ]);
  const [certificate, certError] = certResult;
  const fromFlows = await gatherFlowIntel(host, opts.listFlows, opts.getFlow);
  return {
    url,
    host,
    origin,
    secure,
    internal,
    certificate: secure ? certificate : null,
    certError: secure ? certError : null,
    cookies,
    permissions: origin ? listPermissions(origin) : [],
    intel: {
      ips: [...intelBase.a, ...intelBase.aaaa],
      dns: intelBase,
      tech: fromFlows.tech,
      headerSummary: fromFlows.headerSummary,
      flowCount: fromFlows.flowCount,
      lastStatus: fromFlows.lastStatus,
    },
  };
}

async function readCookies(ses: Session, url: string): Promise<SiteCookie[]> {
  try {
    const list = await ses.cookies.get({ url });
    return list.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? "",
      path: cookie.path ?? "/",
      secure: Boolean(cookie.secure),
      httpOnly: Boolean(cookie.httpOnly),
      sameSite: String(cookie.sameSite ?? "unspecified"),
    }));
  } catch {
    return [];
  }
}

async function gatherDns(host: string): Promise<{ a: string[]; aaaa: string[] }> {
  if (!host) {
    return { a: [], aaaa: [] };
  }
  const [a, aaaa] = await Promise.all([resolveSafe(() => dns.resolve4(host)), resolveSafe(() => dns.resolve6(host))]);
  return { a, aaaa };
}

async function gatherFlowIntel(
  host: string,
  listFlows?: (host: string) => Promise<FlowList>,
  getFlow?: (id: string) => Promise<FlowDetail>,
): Promise<{ tech: string[]; headerSummary: HeaderPair[]; flowCount: number; lastStatus: number | null }> {
  const empty = { tech: [], headerSummary: [] as HeaderPair[], flowCount: 0, lastStatus: null as number | null };
  if (!listFlows || !host) {
    return empty;
  }
  try {
    const list = await listFlows(host);
    const details: FlowDetail[] = [];
    if (getFlow) {
      for (const item of list.items.slice(0, 5)) {
        try {
          details.push(await getFlow(item.id));
        } catch {
          // skip
        }
      }
    }
    const parsed = intelFromFlows(details);
    return { ...parsed, flowCount: list.total, lastStatus: parsed.lastStatus ?? list.items[0]?.status ?? null };
  } catch {
    return empty;
  }
}

function intelFromFlows(flows: FlowDetail[]): { tech: string[]; headerSummary: HeaderPair[]; lastStatus: number | null } {
  const tech = new Set<string>();
  const headers = new Map<string, string>();
  let lastStatus: number | null = null;
  for (const flow of flows) {
    if (lastStatus === null && flow.status != null) {
      lastStatus = flow.status;
    }
    for (const header of flow.resp_headers ?? []) {
      const name = header.name.toLowerCase();
      if (!TECH_HEADERS.includes(name) || headers.has(name)) {
        continue;
      }
      headers.set(name, header.value);
      if (["server", "x-powered-by", "x-generator", "via", "x-cdn"].includes(name)) {
        tech.add(`${header.name}: ${header.value}`);
      }
    }
  }
  return {
    tech: [...tech],
    headerSummary: [...headers.entries()].map(([name, value]) => ({ name, value })),
    lastStatus,
  };
}

async function resolveSafe(fn: () => Promise<string[]>): Promise<string[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function readCertificate(host: string, port: number): Promise<readonly [SiteCertificate | null, string | null]> {
  return new Promise((resolve) => {
    const socket = tlsConnect({ host, port, servername: host, timeout: 5000, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true) as PeerCertificate & {
        subjectaltname?: string;
        fingerprint256?: string;
        serialNumber?: string;
      };
      const protocol = socket.getProtocol();
      const authorized = socket.authorized;
      const authError = socket.authorizationError;
      socket.end();
      if (!cert || !cert.issuer) {
        resolve([null, "The server did not present a certificate."]);
        return;
      }
      const sans = String(cert.subjectaltname ?? "")
        .split(",")
        .map((part) => part.trim().replace(/^DNS:/i, "").replace(/^IP Address:/i, ""))
        .filter(Boolean);
      resolve([
        {
          subject: formatDn(cert.subject),
          issuer: formatDn(cert.issuer),
          validFrom: String(cert.valid_from ?? ""),
          validTo: String(cert.valid_to ?? ""),
          sans,
          protocol,
          authorized,
          fingerprint: String(cert.fingerprint256 ?? cert.fingerprint ?? ""),
          serial: String(cert.serialNumber ?? ""),
        },
        authorized ? null : authError ? String(authError) : null,
      ]);
    });
    socket.on("error", (err) => resolve([null, err.message]));
    socket.on("timeout", () => {
      socket.destroy();
      resolve([null, "Timed out reading the certificate."]);
    });
  });
}

function formatDn(dn: PeerCertificate["subject"] | undefined): string {
  if (!dn) {
    return "";
  }
  const rec = dn as unknown as Record<string, string | string[]>;
  const parts = ["CN", "O", "OU", "C", "ST", "L"]
    .map((key) => {
      const value = rec[key];
      if (!value) {
        return null;
      }
      return `${key}=${Array.isArray(value) ? value.join(" ") : value}`;
    })
    .filter((item): item is string => Boolean(item));
  return parts.join(", ") || JSON.stringify(dn);
}

