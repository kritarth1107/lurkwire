export const DEFAULT_WORDLIST = [
  "admin", "administrator", "login", "logout", "signin", "signup", "register", "account", "user", "users",
  "api", "api/v1", "api/v2", "api/docs", "api/swagger", "swagger", "swagger.json", "swagger-ui", "openapi.json",
  "graphql", "graphiql", "altair", "playground", "v1/graphql",
  ".git", ".git/HEAD", ".git/config", ".svn", ".env", ".env.local", ".env.production", ".DS_Store",
  "backup", "backup.zip", "backup.tar.gz", "dump.sql", "db.sql", "config", "config.js", "config.json",
  "debug", "health", "healthz", "ready", "status", "metrics", "actuator", "actuator/health", "actuator/env",
  "phpinfo.php", "server-status", "server-info", "robots.txt", "sitemap.xml", "crossdomain.xml", "security.txt",
  ".well-known/security.txt", ".well-known/openid-configuration", "favicon.ico",
  "wp-admin", "wp-login.php", "wp-json", "administrator", "console", "dashboard", "panel", "manage",
  "internal", "private", "secret", "hidden", "test", "testing", "dev", "staging", "beta",
  "upload", "uploads", "files", "static", "assets", "public", "tmp", "temp",
  "js", "javascript", "scripts", "main.js", "app.js", "bundle.js", "vendor.js",
  "admin.php", "admin.html", "login.php", "index.php", "index.json",
  "trace", "server", "info", "version", "readme", "README.md", "LICENSE", "CHANGELOG",
  "cpanel", "webmail", "owa", "exchange", "jenkins", "solr", "kibana", "grafana",
  "phpmyadmin", "adminer", "elmah", "trace.axd",
].map((item) => item.replace(/^\//, ""));

export function joinPath(baseUrl: string, word: string, extension = ""): string {
  const base = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
  const suffix = extension && !word.includes(".") && !word.endsWith("/") ? `${word}${extension}` : word;
  const path = suffix.startsWith("/") ? suffix : `/${suffix}`;
  const prefix = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname === "/" ? "" : base.pathname;
  base.pathname = `${prefix}${path}`;
  return base.toString();
}

export function expandWordlist(words: string[], extensions: string[]): string[] {
  const exts = extensions.filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const word of words.map((item) => item.trim()).filter(Boolean)) {
    const candidates = [word, ...exts.map((ext) => (word.includes(".") ? word : `${word}${ext}`))];
    for (const item of candidates) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

export function isInterestingStatus(status: number | null): boolean {
  if (status == null) {
    return false;
  }
  if (status === 200 || status === 201 || status === 204) {
    return true;
  }
  if (status === 301 || status === 302 || status === 307 || status === 308) {
    return true;
  }
  if (status === 401 || status === 403 || status === 405) {
    return true;
  }
  return status >= 500;
}

export type DiscoverHit = {
  url: string;
  word: string;
  status: number | null;
  length: number;
  interesting: boolean;
  flowId?: string;
  error?: string;
};

export function parseWordlist(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((item) => item.trim().replace(/^\//, "")).filter((item) => item && !item.startsWith("#")))];
}
