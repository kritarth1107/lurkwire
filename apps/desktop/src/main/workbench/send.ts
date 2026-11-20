import { createHash } from "node:crypto";
import type { FlowDetail, HeaderPair, RepeaterSendRequest } from "../../shared/types";
import {
  applyMatchRules,
  applySetCookieHeaders,
  buildHttpRequest,
  cookieHeaderFor,
  interpolate,
  interpolateObject,
  mergeVariableLayers,
  resolveAuth,
  toRepeaterSend,
  type VariableMap,
  type WbAuth,
  type WbHistoryEntry,
  type WbRequest,
  type WbSendResult,
  type WbWorkspace,
} from "../../shared/workbench";
import { loadWorkspace, saveWorkspace } from "./store";
import { runWorkbenchScript } from "./scripts";
import { signAwsV4 } from "./sigv4";
import { newId } from "../../shared/workbench";

export type WorkbenchTransport = {
  send: (req: RepeaterSendRequest) => Promise<FlowDetail>;
  getBody: (id: string, which: "req" | "resp") => Promise<ArrayBuffer>;
  projectId: () => string | null;
};

function bodyBuffer(built: { body?: string; bodyBase64?: boolean }): Buffer {
  if (!built.body) {
    return Buffer.alloc(0);
  }
  return built.bodyBase64 ? Buffer.from(built.body, "base64") : Buffer.from(built.body, "utf8");
}

function looksText(mime: string | null, bytes: Buffer): boolean {
  const type = (mime ?? "").toLowerCase();
  if (type.startsWith("text/") || type.includes("json") || type.includes("xml") || type.includes("javascript") || type.includes("graphql")) {
    return true;
  }
  const sample = bytes.subarray(0, 512);
  return !sample.includes(0);
}

function assembleMultipart(request: WbRequest, headers: HeaderPair[]): { headers: HeaderPair[]; body: string; bodyBase64: true } {
  const boundary = `----LurkwireForm${newId().replace(/-/g, "").slice(0, 16)}`;
  const chunks: Buffer[] = [];
  for (const field of request.body.formdata ?? []) {
    if (!field.enabled || !field.key) {
      continue;
    }
    if (field.kind === "file" && field.fileBase64) {
      const filename = field.fileName || "upload.bin";
      const mime = field.mime || "application/octet-stream";
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.key}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
        ),
      );
      chunks.push(Buffer.from(field.fileBase64, "base64"));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${field.key}"\r\n\r\n${field.value}\r\n`,
        ),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks).toString("base64");
  const next = headers.filter((item) => item.name.toLowerCase() !== "content-type");
  next.push({ name: "Content-Type", value: `multipart/form-data; boundary=${boundary}` });
  return { headers: next, body, bodyBase64: true };
}

function parseDigestChallenge(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const trimmed = header.replace(/^Digest\s+/i, "");
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|[^,]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed))) {
    const key = match[1] ?? "";
    let value = (match[2] ?? "").trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function applyDigest(
  method: string,
  url: string,
  headers: HeaderPair[],
  challengeHeader: string,
  username: string,
  password: string,
): HeaderPair[] {
  const challenge = parseDigestChallenge(challengeHeader);
  const parsed = new URL(url);
  const uri = `${parsed.pathname}${parsed.search}`;
  const realm = challenge.realm ?? "";
  const nonce = challenge.nonce ?? "";
  const qop = (challenge.qop ?? "").split(",")[0]?.trim() ?? "";
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method.toUpperCase()}:${uri}`);
  const nc = "00000001";
  const cnonce = newId().replace(/-/g, "").slice(0, 16);
  let response: string;
  if (qop) {
    response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
  } else {
    response = md5(`${ha1}:${nonce}:${ha2}`);
  }
  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (challenge.opaque) {
    parts.push(`opaque="${challenge.opaque}"`);
  }
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }
  if (challenge.algorithm) {
    parts.push(`algorithm=${challenge.algorithm}`);
  }
  const next = headers.filter((item) => item.name.toLowerCase() !== "authorization");
  next.push({ name: "Authorization", value: `Digest ${parts.join(", ")}` });
  return next;
}

async function maybeFetchOAuthToken(
  auth: WbAuth,
  vars: VariableMap,
  transport: WorkbenchTransport,
): Promise<WbAuth> {
  if (auth.type !== "oauth2") {
    return auth;
  }
  if (auth.oauth2?.accessToken) {
    return auth;
  }
  if (auth.oauth2?.grant !== "client_credentials" || !auth.oauth2.tokenUrl) {
    return auth;
  }
  const tokenUrl = interpolate(auth.oauth2.tokenUrl, vars);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: interpolate(auth.oauth2.clientId ?? "", vars),
    client_secret: interpolate(auth.oauth2.clientSecret ?? "", vars),
  });
  if (auth.oauth2.scope) {
    body.set("scope", interpolate(auth.oauth2.scope, vars));
  }
  if (auth.oauth2.audience) {
    body.set("audience", interpolate(auth.oauth2.audience, vars));
  }
  const flow = await transport.send({
    project_id: transport.projectId() ?? undefined,
    method: "POST",
    url: tokenUrl,
    headers: [
      { name: "Content-Type", value: "application/x-www-form-urlencoded" },
      { name: "Accept", value: "application/json" },
    ],
    body: body.toString(),
  });
  const raw = flow.resp_preview ?? "";
  try {
    const json = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
    if (json.access_token) {
      return {
        ...auth,
        oauth2: {
          ...auth.oauth2,
          accessToken: json.access_token,
          refreshToken: json.refresh_token ?? auth.oauth2.refreshToken,
        },
      };
    }
  } catch {
    /* leave auth unchanged */
  }
  return auth;
}

function appendHistory(workspace: WbWorkspace, entry: WbHistoryEntry): void {
  workspace.history = [entry, ...workspace.history].slice(0, 200);
}

export async function sendWorkbenchRequest(
  draft: WbRequest,
  transport: WorkbenchTransport,
  options?: { persist?: boolean; extraVars?: VariableMap },
): Promise<WbSendResult> {
  const workspace = loadWorkspace();
  const collection = workspace.collections.find((item) => item.id === draft.collectionId);
  const environment = workspace.environments.find((item) => item.id === workspace.activeEnvironmentId);
  let vars = mergeVariableLayers([
    workspace.globals,
    collection?.variables,
    environment?.variables,
    options?.extraVars,
  ]);

  const scriptRequest = {
    method: draft.method,
    url: interpolate(draft.url, vars),
    headers: draft.headers.filter((item) => item.enabled).map((item) => ({ name: interpolate(item.key, vars), value: interpolate(item.value, vars) })),
    body: draft.body.mode === "json" ? draft.body.json : draft.body.raw,
  };

  const pre = runWorkbenchScript(draft.preRequestScript ?? "", "prerequest", {
    env: vars,
    globals: mergeVariableLayers([workspace.globals]),
    collection: mergeVariableLayers([collection?.variables]),
    request: scriptRequest,
  });

  vars = mergeVariableLayers([pre.globals, pre.collection, pre.env]);
  if (collection) {
    collection.variables = collection.variables.map((item) =>
      Object.prototype.hasOwnProperty.call(pre.collection, item.key)
        ? { ...item, value: pre.collection[item.key] ?? item.value }
        : item,
    );
  }
  if (environment) {
    environment.variables = environment.variables.map((item) =>
      Object.prototype.hasOwnProperty.call(pre.env, item.key) ? { ...item, value: pre.env[item.key] ?? item.value } : item,
    );
  }
  workspace.globals = workspace.globals.map((item) =>
    Object.prototype.hasOwnProperty.call(pre.globals, item.key)
      ? { ...item, value: pre.globals[item.key] ?? item.value }
      : item,
  );

  const interpolated = interpolateObject(
    {
      ...draft,
      headers: draft.headers,
      params: draft.params,
      body: draft.body,
      auth: draft.auth,
      url: pre.request.url || draft.url,
    },
    vars,
  );

  let auth = resolveAuth(interpolated.auth, collection?.auth);
  auth = await maybeFetchOAuthToken(auth, vars, transport);
  const prepared = { ...interpolated, auth };
  let built = buildHttpRequest({ ...prepared, auth });

  // Cookie jar: add Cookie header unless the request already set one.
  if (!built.headers.some((item) => item.name.toLowerCase() === "cookie")) {
    const cookie = cookieHeaderFor(workspace.cookies, built.url);
    if (cookie) {
      built = { ...built, headers: [...built.headers, { name: "Cookie", value: cookie }] };
    }
  }

  const rewritten = applyMatchRules(
    { url: built.url, headers: built.headers, body: built.body },
    workspace.matchRules ?? [],
  );
  if (rewritten.applied.length > 0) {
    built = { ...built, url: rewritten.value.url, headers: rewritten.value.headers, body: rewritten.value.body };
  }

  if (built.pending === "multipart" || prepared.body.mode === "formdata") {
    const assembled = assembleMultipart(prepared, built.headers);
    built = { ...built, headers: assembled.headers, body: assembled.body, bodyBase64: true, pending: undefined };
  }

  if (built.pending === "awsv4" && auth.awsv4) {
    const signed = signAwsV4(built.method, built.url, built.headers, bodyBuffer(built), auth.awsv4);
    built = { ...built, headers: signed, pending: undefined };
  }

  const sendOnce = (current: typeof built) =>
    transport.send(toRepeaterSend(current, transport.projectId()));

  let flow: FlowDetail | undefined;
  let error: string | undefined;
  try {
    flow = await sendOnce(built);
    if (built.pending === "digest" && auth.digest && flow.status === 401) {
      const www = flow.resp_headers.find((item) => item.name.toLowerCase() === "www-authenticate")?.value ?? "";
      if (/^digest/i.test(www)) {
        const headers = applyDigest(
          built.method,
          built.url,
          built.headers,
          www,
          auth.digest.username,
          auth.digest.password,
        );
        flow = await sendOnce({ ...built, headers, pending: undefined });
      }
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  let responseText = flow?.resp_preview ?? "";
  if (flow) {
    try {
      const buf = Buffer.from(await transport.getBody(flow.id, "resp"));
      responseText = looksText(flow.mime, buf) ? buf.toString("utf8") : buf.toString("base64");
    } catch {
      /* keep preview */
    }
    workspace.cookies = applySetCookieHeaders(workspace.cookies, flow.resp_headers, built.url);
  }

  const tests =
    flow && draft.testScript
      ? runWorkbenchScript(draft.testScript, "test", {
          env: vars,
          globals: mergeVariableLayers([workspace.globals]),
          collection: mergeVariableLayers([collection?.variables]),
          request: { method: built.method, url: built.url, headers: built.headers, body: built.body },
          response: {
            code: flow.status ?? 0,
            status: flow.status ?? 0,
            headers: flow.resp_headers,
            text: responseText,
            responseTime: flow.duration_ms ?? 0,
            responseSize: flow.resp_len,
          },
        })
      : { logs: [], tests: [], env: vars, globals: {}, collection: {}, request: { method: built.method, url: built.url, headers: built.headers, body: built.body } };

  const result: WbSendResult = {
    status: flow?.status ?? null,
    durationMs: flow?.duration_ms ?? null,
    size: flow?.resp_len ?? null,
    flowId: flow?.id,
    error,
    tests: [...pre.tests, ...tests.tests],
    logs: [...pre.logs, ...tests.logs],
    responseText,
    responseHeaders: flow?.resp_headers,
  };

  appendHistory(workspace, {
    id: newId(),
    at: Date.now(),
    requestId: draft.id,
    name: draft.name,
    method: built.method,
    url: built.url,
    status: result.status,
    durationMs: result.durationMs,
    size: result.size,
    flowId: result.flowId,
    error: result.error,
  });

  if (options?.persist !== false) {
    saveWorkspace(workspace);
  }

  return result;
}

