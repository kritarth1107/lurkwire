import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { app } from "electron";

export function repoRoot(): string {
  const candidates = [
    process.env.LURKWIRE_ROOT,
    resolve(__dirname, "../../../.."),
    resolve(app.getAppPath(), "../.."),
    process.cwd(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (
      existsSync(join(candidate, "Cargo.toml")) &&
      existsSync(join(candidate, "apps/desktop"))
    ) {
      return candidate;
    }
  }
  return resolve(__dirname, "../../../..");
}

export function proxyBinary(): string {
  if (process.env.LURKWIRE_PROXY_BIN) {
    return process.env.LURKWIRE_PROXY_BIN;
  }
  const name = process.platform === "win32" ? "lurkwire-proxy.exe" : "lurkwire-proxy";
  if (app.isPackaged) {
    return join(process.resourcesPath, name);
  }
  const root = repoRoot();
  const debug = join(root, "target/debug", name);
  const release = join(root, "target/release", name);
  const debugExists = existsSync(debug);
  const releaseExists = existsSync(release);
  if (debugExists && releaseExists) {
    return statSync(debug).mtimeMs >= statSync(release).mtimeMs ? debug : release;
  }
  if (debugExists) {
    return debug;
  }
  if (releaseExists) {
    return release;
  }
  return debug;
}
