/** Headless setup for the official DVWA docker lab (authorized practice only). */

export type LabCookie = { name: string; value: string; path: string };

export type DvwaSetup = {
  ok: boolean;
  base: string;
  cookies: LabCookie[];
  sessionHeader: string;
  error?: string;
};

const DEFAULT_BASE = "http://127.0.0.1:4280";

function tokenOf(html: string): string | null {
  const match =
    html.match(/name=['"]user_token['"]\s+value=['"]([^'"]+)/i) ??
    html.match(/value=['"]([^'"]+)['"]\s+name=['"]user_token['"]/i);
  return match?.[1] ?? null;
}

function absorb(jar: Map<string, string>, res: Response): void {
  const header = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const list = header.length ? header : res.headers.get("set-cookie") ? [res.headers.get("set-cookie") as string] : [];
  for (const raw of list) {
    const first = raw.split(";")[0]?.trim() ?? "";
    const eq = first.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    jar.set(first.slice(0, eq), first.slice(eq + 1));
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(
  jar: Map<string, string>,
  url: string,
  init?: RequestInit,
): Promise<{ res: Response; body: string }> {
  const headers = new Headers(init?.headers);
  const cookie = cookieHeader(jar);
  if (cookie) {
    headers.set("Cookie", cookie);
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/x-www-form-urlencoded");
  }
  const res = await fetch(url, { ...init, headers, redirect: "manual" });
  absorb(jar, res);
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location && (!init || init.method === "GET" || init.method === "HEAD" || !init.method)) {
    const next = new URL(location, url).toString();
    return request(jar, next, { method: "GET" });
  }
  const body = await res.text();
  return { res, body };
}

async function postForm(jar: Map<string, string>, url: string, data: Record<string, string>) {
  const body = new URLSearchParams(data).toString();
  const { res, body: html } = await request(jar, url, { method: "POST", body });
  // Follow a login redirect manually (we used redirect: manual)
  const location = res.headers.get("location");
  if (res.status >= 300 && res.status < 400 && location) {
    return request(jar, new URL(location, url).toString(), { method: "GET" });
  }
  return { res, body: html };
}

export async function setupDvwa(base = DEFAULT_BASE): Promise<DvwaSetup> {
  const jar = new Map<string, string>();
  try {
    const setup = await request(jar, `${base}/setup.php`);
    const create: Record<string, string> = { create_db: "Create / Reset Database" };
    const setupToken = tokenOf(setup.body);
    if (setupToken) {
      create.user_token = setupToken;
    }
    await postForm(jar, `${base}/setup.php`, create);

    const loginPage = await request(jar, `${base}/login.php`);
    const loginToken = tokenOf(loginPage.body);
    const login: Record<string, string> = { username: "admin", password: "password", Login: "Login" };
    if (loginToken) {
      login.user_token = loginToken;
    }
    const signedIn = await postForm(jar, `${base}/login.php`, login);
    if (!/Welcome :: Damn Vulnerable/i.test(signedIn.body) && !/logout/i.test(signedIn.body)) {
      // still try security + a protected page; login may have landed on index with a different title
    }

    const securityPage = await request(jar, `${base}/security.php`);
    if (securityPage.res.status === 302 || /Login ::/i.test(securityPage.body)) {
      return { ok: false, base, cookies: cookiesOf(jar), sessionHeader: cookieHeader(jar), error: "login did not stick; security.php is unauthenticated" };
    }
    const sec: Record<string, string> = { security: "low", seclev_submit: "Submit" };
    const secToken = tokenOf(securityPage.body);
    if (secToken) {
      sec.user_token = secToken;
    }
    await postForm(jar, `${base}/security.php`, sec);
    jar.set("security", "low");

    return { ok: true, base, cookies: cookiesOf(jar), sessionHeader: cookieHeader(jar) };
  } catch (err) {
    return {
      ok: false,
      base,
      cookies: cookiesOf(jar),
      sessionHeader: cookieHeader(jar),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function cookiesOf(jar: Map<string, string>): LabCookie[] {
  return [...jar.entries()].map(([name, value]) => ({ name, value, path: "/" }));
}

export const DVWA_SQLI_UNION =
  "http://127.0.0.1:4280/vulnerabilities/sqli/?id=-1'+UNION+SELECT+user,+password+FROM+users%23&Submit=Submit";
export const DVWA_SQLI_OR =
  "http://127.0.0.1:4280/vulnerabilities/sqli/?id=1'+OR+'1'='1&Submit=Submit";
export const DVWA_XSS =
  "http://127.0.0.1:4280/vulnerabilities/xss_r/?name=%3Cscript%3Ealert(1)%3C/script%3E";
export const DVWA_BRUTE = "http://127.0.0.1:4280/vulnerabilities/brute/";
export const DVWA_LOGIN = "http://127.0.0.1:4280/login.php";
