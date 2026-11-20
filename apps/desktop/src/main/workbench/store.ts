import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type { WbKv, WbWorkspace } from "../../shared/workbench";
import { emptyWorkspace, starterWorkspace } from "../../shared/workbench";

type SecretMap = Record<string, string>;

function dir(): string {
  return join(app.getPath("userData"), "workbench");
}

function workspacePath(): string {
  return join(dir(), "workspace.json");
}

function secretsPath(): string {
  return join(dir(), "secrets.bin");
}

function secretKey(scope: string, id: string, name: string): string {
  return `${scope}:${id}:${name}`;
}

function collectSecrets(workspace: WbWorkspace): SecretMap {
  const out: SecretMap = {};
  const take = (scope: string, id: string, list: WbKv[]) => {
    for (const item of list) {
      if (item.secret && item.value) {
        out[secretKey(scope, id, item.key)] = item.value;
      }
    }
  };
  take("global", "globals", workspace.globals);
  for (const env of workspace.environments) {
    take("env", env.id, env.variables);
  }
  for (const col of workspace.collections) {
    take("collection", col.id, col.variables);
  }
  return out;
}

function stripSecrets(workspace: WbWorkspace): WbWorkspace {
  const mask = (list: WbKv[]): WbKv[] =>
    list.map((item) =>
      item.secret
        ? { ...item, value: "", secretSet: Boolean(item.value) || Boolean(item.secretSet) }
        : item,
    );
  return {
    ...workspace,
    globals: mask(workspace.globals),
    environments: workspace.environments.map((item) => ({ ...item, variables: mask(item.variables) })),
    collections: workspace.collections.map((item) => ({ ...item, variables: mask(item.variables) })),
  };
}

function applySecrets(workspace: WbWorkspace, secrets: SecretMap): WbWorkspace {
  const fill = (scope: string, id: string, list: WbKv[]): WbKv[] =>
    list.map((item) => {
      if (!item.secret) {
        return item;
      }
      const value = secrets[secretKey(scope, id, item.key)] ?? item.value;
      return { ...item, value, secretSet: Boolean(value) };
    });
  return {
    ...workspace,
    globals: fill("global", "globals", workspace.globals),
    environments: workspace.environments.map((item) => ({
      ...item,
      variables: fill("env", item.id, item.variables),
    })),
    collections: workspace.collections.map((item) => ({
      ...item,
      variables: fill("collection", item.id, item.variables),
    })),
  };
}

function loadSecrets(): SecretMap {
  if (!existsSync(secretsPath())) {
    return {};
  }
  try {
    const buf = readFileSync(secretsPath());
    if (!safeStorage.isEncryptionAvailable()) {
      return {};
    }
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json) as SecretMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSecrets(secrets: SecretMap): void {
  mkdirSync(dir(), { recursive: true });
  const keys = Object.keys(secrets);
  if (keys.length === 0) {
    if (existsSync(secretsPath())) {
      writeFileSync(secretsPath(), Buffer.alloc(0));
    }
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS key encryption is unavailable, so Workbench secrets were not saved.");
  }
  writeFileSync(secretsPath(), safeStorage.encryptString(JSON.stringify(secrets)));
}

function normalize(workspace: WbWorkspace): WbWorkspace {
  return {
    ...emptyWorkspace(),
    ...workspace,
    version: 1,
    collections: workspace.collections ?? [],
    folders: workspace.folders ?? [],
    requests: workspace.requests ?? [],
    environments: workspace.environments ?? [],
    globals: workspace.globals ?? [],
    history: (workspace.history ?? []).slice(0, 200),
    cookies: workspace.cookies ?? [],
    matchRules: workspace.matchRules ?? [],
    activeEnvironmentId: workspace.activeEnvironmentId ?? null,
  };
}

let cached: WbWorkspace | null = null;

export function loadWorkspace(): WbWorkspace {
  if (cached) {
    return cached;
  }
  if (!existsSync(workspacePath())) {
    cached = starterWorkspace();
    persist(cached);
    return cached;
  }
  try {
    const parsed = JSON.parse(readFileSync(workspacePath(), "utf8")) as WbWorkspace;
    cached = applySecrets(normalize(parsed), loadSecrets());
    return cached;
  } catch {
    cached = starterWorkspace();
    return cached;
  }
}

export function peekWorkspaceMasked(): WbWorkspace {
  return stripSecrets(loadWorkspace());
}

function persist(workspace: WbWorkspace): void {
  mkdirSync(dir(), { recursive: true });
  const secrets = collectSecrets(workspace);
  const masked = stripSecrets(workspace);
  writeFileSync(workspacePath(), `${JSON.stringify(masked, null, 2)}\n`);
  try {
    saveSecrets(secrets);
  } catch (error) {
    // Keep the workspace; surface the encryption error to the caller of saveWorkspace.
    throw error;
  }
}

export function saveWorkspace(incoming: WbWorkspace): WbWorkspace {
  const previous = loadWorkspace();
  const mergedSecrets = collectSecrets(previous);
  const incomingSecrets = collectSecrets(incoming);
  Object.assign(mergedSecrets, incomingSecrets);
  // Restore unchanged secret values the renderer omitted.
  const filled = applySecrets(normalize(incoming), mergedSecrets);
  // If the renderer sent a new secret value, applySecrets already has it via incomingSecrets
  // because collectSecrets read incoming before strip. applySecrets uses incoming values first
  // then map - wait, applySecrets prefers map over item.value:
  //   secrets[key] ?? item.value
  // and we merged previous then incoming, so new values win. Good.
  cached = filled;
  persist(cached);
  return cached;
}

export function replaceWorkspace(workspace: WbWorkspace): WbWorkspace {
  cached = normalize(workspace);
  persist(cached);
  return cached;
}

export function resetWorkspaceCache(): void {
  cached = null;
}
