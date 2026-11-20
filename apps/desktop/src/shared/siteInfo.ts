export type SiteCertificate = {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  sans: string[];
  protocol: string | null;
  authorized: boolean;
  fingerprint: string;
  serial: string;
};

export type SiteCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: string;
};

export type SiteStorageItem = {
  key: string;
  value: string;
};

export type SiteStorage = {
  origin: string;
  localStorage: SiteStorageItem[];
  sessionStorage: SiteStorageItem[];
};

export function cookieTargetUrl(cookie: Pick<SiteCookie, "domain" | "path" | "secure">): string {
  const host = cookie.domain.replace(/^\./, "") || "localhost";
  const path = cookie.path || "/";
  return `${cookie.secure ? "https" : "http"}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

export type SitePermission = {
  origin: string;
  permission: string;
  state: "granted" | "denied";
  at: number;
};

export type SiteIntel = {
  ips: string[];
  dns: { a: string[]; aaaa: string[] };
  tech: string[];
  headerSummary: { name: string; value: string }[];
  flowCount: number;
  lastStatus: number | null;
};

export type SiteInfo = {
  url: string;
  host: string;
  origin: string;
  secure: boolean;
  internal: boolean;
  certificate: SiteCertificate | null;
  certError: string | null;
  cookies: SiteCookie[];
  permissions: SitePermission[];
  intel: SiteIntel;
};
