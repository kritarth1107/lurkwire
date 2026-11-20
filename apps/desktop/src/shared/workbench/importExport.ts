import { looksLikeYamlOpenApi, parseYaml } from "../yaml";
import { parseCurl } from "./curl";
import { newId } from "./id";
import { kv } from "./kv";
import type {
  WbAuth,
  WbBody,
  WbCollection,
  WbFolder,
  WbImportResult,
  WbKv,
  WbRawLanguage,
  WbRequest,
} from "./types";
import { emptyAuth, emptyBody } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function now(): number {
  return Date.now();
}

function collection(name: string, description = "", variables: WbKv[] = [], auth: WbAuth = emptyAuth("none")): WbCollection {
  const ts = now();
  return { id: newId(), name, description, variables, auth, createdAt: ts, updatedAt: ts };
}

function folder(name: string, collectionId: string, parentId: string | null, description = ""): WbFolder {
  return { id: newId(), name, collectionId, parentId, description };
}

function emptyImport(source: WbImportResult["source"], warnings: string[] = []): WbImportResult {
  return { collections: [], folders: [], requests: [], environments: [], warnings, source };
}

function postmanUrl(url: unknown): { raw: string; params: WbKv[] } {
  const params: WbKv[] = [];
  if (typeof url === "string") {
    return { raw: url, params };
  }
  if (!isRecord(url)) {
    return { raw: "", params };
  }
  if (Array.isArray(url.query)) {
    for (const item of url.query) {
      if (!isRecord(item)) {
        continue;
      }
      params.push(
        kv(asString(item.key), asString(item.value), item.disabled !== true, {
          description: asString(item.description) || undefined,
        }),
      );
    }
  }
  if (typeof url.raw === "string" && url.raw) {
    const raw = url.raw.replace(/\?[^#]*/, "");
    return { raw, params };
  }
  const protocol = asString(url.protocol, "https");
  const host = Array.isArray(url.host) ? url.host.map(String).join(".") : asString(url.host);
  const path = Array.isArray(url.path) ? `/${url.path.map(String).join("/")}` : asString(url.path, "/");
  return { raw: host ? `${protocol}://${host}${path || "/"}` : path, params };
}

function bagFromAuth(auth: Record<string, unknown>, type: string): Record<string, string> {
  const raw = auth[type];
  const bag: Record<string, string> = {};
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (isRecord(item) && typeof item.key === "string") {
        bag[item.key] = asString(item.value);
      }
    }
  } else if (isRecord(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      bag[key] = asString(value);
    }
  }
  return bag;
}

function postmanAuth(auth: unknown): WbAuth {
  if (!isRecord(auth) || !auth.type || auth.type === "noauth") {
    return emptyAuth("none");
  }
  const type = asString(auth.type);
  const bag = bagFromAuth(auth, type);
  if (type === "bearer") {
    return { type: "bearer", bearer: { token: bag.token ?? "" } };
  }
  if (type === "basic") {
    return { type: "basic", basic: { username: bag.username ?? "", password: bag.password ?? "" } };
  }
  if (type === "apikey") {
    const addTo = bag.in === "query" || bag.addTo === "query" ? "query" : "header";
    return { type: "apikey", apikey: { key: bag.key ?? "", value: bag.value ?? "", addTo } };
  }
  if (type === "jwt") {
    return { type: "jwt", jwt: { token: bag.token ?? bag.secret ?? "" } };
  }
  if (type === "digest") {
    return { type: "digest", digest: { username: bag.username ?? "", password: bag.password ?? "" } };
  }
  if (type === "awsv4" || type === "aws") {
    return {
      type: "awsv4",
      awsv4: {
        accessKey: bag.accessKey ?? bag.accessKeyId ?? "",
        secretKey: bag.secretKey ?? bag.secretAccessKey ?? "",
        region: bag.region ?? "us-east-1",
        service: bag.service ?? "execute-api",
        sessionToken: bag.sessionToken,
      },
    };
  }
  if (type === "oauth2") {
    const grant =
      bag.grant_type === "client_credentials" || bag.grantType === "client_credentials"
        ? "client_credentials"
        : "authorization_code";
    return {
      type: "oauth2",
      oauth2: {
        grant,
        accessToken: bag.accessToken ?? bag.access_token,
        refreshToken: bag.refreshToken ?? bag.refresh_token,
        tokenUrl: bag.accessTokenUrl ?? bag.tokenUrl ?? bag.accessTokenUrl,
        authUrl: bag.authUrl ?? bag.auth_url,
        clientId: bag.clientId ?? bag.client_id,
        clientSecret: bag.clientSecret ?? bag.client_secret,
        scope: bag.scope,
        pkce: bag.grant_type === "authorization_code_with_pkce" || bag.challengeAlgorithm === "S256",
        addTo: bag.addTokenTo === "queryParams" ? "query" : "header",
      },
    };
  }
  return emptyAuth("none");
}

function postmanEvents(event: unknown): { pre?: string; test?: string } {
  const out: { pre?: string; test?: string } = {};
  if (!Array.isArray(event)) {
    return out;
  }
  for (const item of event) {
    if (!isRecord(item)) {
      continue;
    }
    const listen = asString(item.listen);
    const script = isRecord(item.script) ? item.script : {};
    const exec = Array.isArray(script.exec) ? script.exec.map(String).join("\n") : asString(script.exec);
    if (listen === "prerequest" && exec) {
      out.pre = exec;
    }
    if (listen === "test" && exec) {
      out.test = exec;
    }
  }
  return out;
}

function postmanBody(body: unknown): WbBody {
  const result = emptyBody();
  if (!isRecord(body) || !body.mode) {
    return result;
  }
  const mode = asString(body.mode);
  if (mode === "raw") {
    const raw = asString(body.raw);
    const language = isRecord(body.options) && isRecord(body.options.raw) ? asString(body.options.raw.language) : "";
    const lang: WbRawLanguage =
      language === "xml" || language === "html" || language === "javascript" || language === "text" ? language : "json";
    if (lang === "json" || looksJson(raw)) {
      return { ...result, mode: "json", json: raw, raw, rawLanguage: "json" };
    }
    return { ...result, mode: "raw", raw, rawLanguage: lang };
  }
  if (mode === "urlencoded" && Array.isArray(body.urlencoded)) {
    return {
      ...result,
      mode: "urlencoded",
      urlencoded: body.urlencoded.filter(isRecord).map((item) =>
        kv(asString(item.key), asString(item.value), item.disabled !== true),
      ),
    };
  }
  if (mode === "formdata" && Array.isArray(body.formdata)) {
    return {
      ...result,
      mode: "formdata",
      formdata: body.formdata.filter(isRecord).map((item) => ({
        ...kv(asString(item.key), asString(item.value), item.disabled !== true),
        kind: asString(item.type) === "file" ? "file" : "text",
        fileName: asString(item.src) || undefined,
      })),
    };
  }
  if (mode === "graphql" && isRecord(body.graphql)) {
    const variables = typeof body.graphql.variables === "string"
      ? body.graphql.variables
      : JSON.stringify(body.graphql.variables ?? {}, null, 2);
    return { ...result, mode: "graphql", graphql: { query: asString(body.graphql.query), variables } };
  }
  if (mode === "file") {
    return result;
  }
  return result;
}

function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function postmanVariables(list: unknown): WbKv[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter(isRecord).map((item) =>
    kv(asString(item.key), asString(item.value), item.disabled !== true, { secret: item.type === "secret" }),
  );
}

function postmanHeaders(header: unknown): WbKv[] {
  if (!Array.isArray(header)) {
    return [];
  }
  return header.filter(isRecord).map((item) =>
    kv(asString(item.key), asString(item.value), item.disabled !== true, {
      description: asString(item.description) || undefined,
    }),
  );
}

function convertPostmanRequest(item: Record<string, unknown>, collectionId: string, folderId: string | null): WbRequest {
  const request = isRecord(item.request) ? item.request : { method: "GET", url: asString(item.request) };
  const { raw, params } = postmanUrl(request.url);
  const events = postmanEvents(item.event);
  return {
    id: newId(),
    name: asString(item.name, "Untitled"),
    description: asString(isRecord(item.request) && isRecord(item.request.description) ? item.request.description.content : item.description) ||
      (typeof item.description === "string" ? item.description : undefined),
    method: asString(request.method, "GET").toUpperCase() || "GET",
    url: raw,
    params,
    headers: postmanHeaders(request.header),
    body: postmanBody(request.body),
    auth: request.auth ? postmanAuth(request.auth) : emptyAuth("inherit"),
    preRequestScript: events.pre,
    testScript: events.test,
    collectionId,
    folderId,
    protocol: "http",
    updatedAt: now(),
  };
}

function walkPostmanItems(
  items: unknown[],
  collectionId: string,
  parentId: string | null,
  out: WbImportResult,
): void {
  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }
    if (Array.isArray(item.item)) {
      const created = folder(asString(item.name, "Folder"), collectionId, parentId, asString(item.description));
      out.folders.push(created);
      walkPostmanItems(item.item, collectionId, created.id, out);
      continue;
    }
    if (item.request) {
      out.requests.push(convertPostmanRequest(item, collectionId, parentId));
    }
  }
}

export function importPostman(data: unknown): WbImportResult {
  if (!isRecord(data) || !isRecord(data.info)) {
    throw new Error("Not a Postman collection");
  }
  const result = emptyImport("postman");
  const col = collection(
    asString(data.info.name, "Postman collection"),
    asString(isRecord(data.info.description) ? data.info.description.content : data.info.description),
    postmanVariables(data.variable),
    data.auth ? postmanAuth(data.auth) : emptyAuth("none"),
  );
  result.collections.push(col);
  if (Array.isArray(data.item)) {
    walkPostmanItems(data.item, col.id, null, result);
  }
  return result;
}

function openApiServers(data: Record<string, unknown>): string {
  if (Array.isArray(data.servers) && isRecord(data.servers[0]) && typeof data.servers[0].url === "string") {
    return data.servers[0].url.replace(/\/$/, "");
  }
  if (typeof data.host === "string") {
    const schemes = Array.isArray(data.schemes) ? asString(data.schemes[0], "https") : "https";
    const base = asString(data.basePath, "");
    return `${schemes}://${data.host}${base}`.replace(/\/$/, "");
  }
  return "{{baseUrl}}";
}

function openApiParams(parameters: unknown, pathParams: unknown): { params: WbKv[]; headers: WbKv[]; path: Record<string, string> } {
  const params: WbKv[] = [];
  const headers: WbKv[] = [];
  const path: Record<string, string> = {};
  const lists = [parameters, pathParams];
  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const item of list) {
      if (!isRecord(item)) {
        continue;
      }
      const name = asString(item.name);
      const location = asString(item.in);
      const example = item.example != null ? String(item.example) : `{{${name}}}`;
      if (location === "query") {
        params.push(kv(name, example, true, { description: asString(item.description) || undefined }));
      } else if (location === "header") {
        headers.push(kv(name, example, true));
      } else if (location === "path") {
        path[name] = example;
      }
    }
  }
  return { params, headers, path };
}

function openApiBody(operation: Record<string, unknown>): WbBody {
  const body = emptyBody();
  const requestBody = isRecord(operation.requestBody) ? operation.requestBody : null;
  const content = requestBody && isRecord(requestBody.content) ? requestBody.content : null;
  const swaggerBody = isRecord(operation.body) ? operation.body : null;
  if (content) {
    if (isRecord(content["application/json"])) {
      const media = content["application/json"];
      const example = isRecord(media) && media.example != null ? JSON.stringify(media.example, null, 2) : "{\n  \n}";
      return { ...body, mode: "json", json: example, raw: example, rawLanguage: "json" };
    }
    if (isRecord(content["application/x-www-form-urlencoded"])) {
      return { ...body, mode: "urlencoded", urlencoded: [] };
    }
    if (isRecord(content["multipart/form-data"])) {
      return { ...body, mode: "formdata", formdata: [] };
    }
  }
  if (swaggerBody) {
    const example = swaggerBody.example != null ? JSON.stringify(swaggerBody.example, null, 2) : "";
    return { ...body, mode: "json", json: example, raw: example, rawLanguage: "json" };
  }
  return body;
}

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);

export function importOpenApi(data: unknown): WbImportResult {
  if (!isRecord(data) || !(data.openapi || data.swagger)) {
    throw new Error("Not an OpenAPI document");
  }
  const result = emptyImport("openapi");
  const info = isRecord(data.info) ? data.info : {};
  const variables: WbKv[] = [];
  const baseUrl = openApiServers(data);
  variables.push(kv("baseUrl", baseUrl === "{{baseUrl}}" ? "https://example.com" : baseUrl, true));
  const col = collection(asString(info.title, "OpenAPI collection"), asString(info.description), variables);
  result.collections.push(col);
  const foldersByTag = new Map<string, WbFolder>();
  const paths = isRecord(data.paths) ? data.paths : {};
  for (const [path, ops] of Object.entries(paths)) {
    if (!isRecord(ops)) {
      continue;
    }
    for (const [verb, operation] of Object.entries(ops)) {
      if (!HTTP_VERBS.has(verb.toLowerCase()) || !isRecord(operation)) {
        continue;
      }
      const tags = Array.isArray(operation.tags) ? operation.tags.map(String) : [];
      const tag = tags[0] ?? "Default";
      let parent = foldersByTag.get(tag);
      if (!parent) {
        parent = folder(tag, col.id, null);
        foldersByTag.set(tag, parent);
        result.folders.push(parent);
      }
      const { params, headers, path: pathVars } = openApiParams(operation.parameters, ops.parameters);
      let urlPath = path.replace(/\{([^}]+)\}/g, (_, name: string) => pathVars[name] ?? `{{${name}}}`);
      const url = `{{baseUrl}}${urlPath.startsWith("/") ? urlPath : `/${urlPath}`}`;
      const name = asString(operation.operationId) || asString(operation.summary) || `${verb.toUpperCase()} ${path}`;
      result.requests.push({
        id: newId(),
        name,
        description: asString(operation.description || operation.summary) || undefined,
        method: verb.toUpperCase(),
        url,
        params,
        headers,
        body: openApiBody(operation),
        auth: emptyAuth("inherit"),
        collectionId: col.id,
        folderId: parent.id,
        protocol: "http",
        updatedAt: now(),
      });
    }
  }
  return result;
}

export function importHar(data: unknown): WbImportResult {
  if (!isRecord(data) || !isRecord(data.log) || !Array.isArray(data.log.entries)) {
    throw new Error("Not a HAR log");
  }
  const result = emptyImport("har");
  const col = collection("HAR import", asString(isRecord(data.log.creator) ? data.log.creator.name : ""));
  result.collections.push(col);
  for (const entry of data.log.entries) {
    if (!isRecord(entry) || !isRecord(entry.request)) {
      continue;
    }
    const req = entry.request;
    const urlRaw = asString(req.url);
    let url = urlRaw;
    const params: WbKv[] = [];
    try {
      const parsed = new URL(urlRaw);
      parsed.searchParams.forEach((value, key) => params.push(kv(key, value)));
      parsed.search = "";
      url = parsed.toString();
    } catch {
      /* keep raw */
    }
    const headers: WbKv[] = Array.isArray(req.headers)
      ? req.headers.filter(isRecord).map((item) => kv(asString(item.name), asString(item.value)))
      : [];
    let body = emptyBody();
    if (isRecord(req.postData)) {
      const mime = asString(req.postData.mimeType);
      const text = asString(req.postData.text);
      if (mime.includes("json") || looksJson(text)) {
        body = { ...body, mode: "json", json: text, raw: text, rawLanguage: "json" };
      } else if (mime.includes("x-www-form-urlencoded") && Array.isArray(req.postData.params)) {
        body = {
          ...body,
          mode: "urlencoded",
          urlencoded: req.postData.params.filter(isRecord).map((item) => kv(asString(item.name), asString(item.value))),
        };
      } else if (text) {
        body = { ...body, mode: "raw", raw: text, rawLanguage: "text" };
      }
    }
    result.requests.push({
      id: newId(),
      name: `${asString(req.method, "GET")} ${safePath(urlRaw)}`,
      method: asString(req.method, "GET").toUpperCase(),
      url,
      params,
      headers,
      body,
      auth: emptyAuth("none"),
      collectionId: col.id,
      folderId: null,
      protocol: "http",
      updatedAt: now(),
    });
  }
  return result;
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function importInsomnia(data: unknown): WbImportResult {
  const resources: unknown[] = isRecord(data) && Array.isArray(data.resources)
    ? data.resources
    : Array.isArray(data)
      ? data
      : isRecord(data) && Array.isArray(data.__export_data)
        ? []
        : [];
  if (isRecord(data) && !Array.isArray(data.resources) && data._type && data._type !== "export") {
    throw new Error("Not an Insomnia export");
  }
  const result = emptyImport("insomnia");
  const list = resources.length > 0 ? resources : isRecord(data) && Array.isArray(data.resources) ? data.resources : [];
  if (list.length === 0 && isRecord(data) && data.__export_format && !data.resources) {
    result.warnings.push("Insomnia export contained no resources.");
    return result;
  }
  const groups = new Map<string, WbFolder | "collection">();
  const idMap = new Map<string, string>();
  // Workspaces / folders first
  const workspaces = list.filter((item) => isRecord(item) && (item._type === "workspace" || item._type === "request_group"));
  const requests = list.filter((item) => isRecord(item) && item._type === "request");
  const envs = list.filter((item) => isRecord(item) && (item._type === "environment" || item._type === "base_environment"));
  let defaultCol: WbCollection | null = null;
  for (const item of workspaces) {
    if (!isRecord(item)) {
      continue;
    }
    const name = asString(item.name, item._type === "workspace" ? "Insomnia" : "Folder");
    if (item._type === "workspace" || !item.parentId) {
      const col = collection(name, asString(item.description));
      result.collections.push(col);
      idMap.set(asString(item._id), col.id);
      groups.set(asString(item._id), "collection");
      defaultCol = defaultCol ?? col;
    }
  }
  if (!defaultCol) {
    defaultCol = collection("Insomnia import");
    result.collections.push(defaultCol);
  }
  // folders with parents
  let pending = workspaces.filter((item) => isRecord(item) && item._type === "request_group");
  let guard = 0;
  while (pending.length && guard < 20) {
    const next: typeof pending = [];
    for (const item of pending) {
      if (!isRecord(item)) {
        continue;
      }
      const parentKey = asString(item.parentId);
      const parentMapped = idMap.get(parentKey);
      const parentIsCollection = groups.get(parentKey) === "collection";
      if (parentKey && !parentMapped && groups.get(parentKey) !== "collection") {
        next.push(item);
        continue;
      }
      const collectionId = parentIsCollection
        ? (parentMapped ?? defaultCol.id)
        : result.folders.find((f) => f.id === parentMapped)?.collectionId ?? defaultCol.id;
      const created = folder(asString(item.name, "Folder"), collectionId, parentIsCollection ? null : parentMapped ?? null);
      result.folders.push(created);
      idMap.set(asString(item._id), created.id);
      groups.set(asString(item._id), created);
    }
    pending = next;
    guard += 1;
  }
  for (const item of requests) {
    if (!isRecord(item)) {
      continue;
    }
    const parentKey = asString(item.parentId);
    const parentMapped = idMap.get(parentKey);
    const parentIsCollection = groups.get(parentKey) === "collection";
    const collectionId = parentIsCollection
      ? (parentMapped ?? defaultCol.id)
      : result.folders.find((f) => f.id === parentMapped)?.collectionId ?? defaultCol.id;
    const folderId = parentIsCollection ? null : parentMapped ?? null;
    const headers: WbKv[] = Array.isArray(item.headers)
      ? item.headers.filter(isRecord).map((h) => kv(asString(h.name), asString(h.value), h.disabled !== true))
      : [];
    const params: WbKv[] = Array.isArray(item.parameters)
      ? item.parameters.filter(isRecord).map((h) => kv(asString(h.name), asString(h.value), h.disabled !== true))
      : [];
    let body = emptyBody();
    if (isRecord(item.body)) {
      const mime = asString(item.body.mimeType);
      const text = asString(item.body.text);
      if (mime.includes("json") || looksJson(text)) {
        body = { ...body, mode: "json", json: text, raw: text, rawLanguage: "json" };
      } else if (mime.includes("form-urlencoded") && Array.isArray(item.body.params)) {
        body = {
          ...body,
          mode: "urlencoded",
          urlencoded: item.body.params.filter(isRecord).map((p) => kv(asString(p.name), asString(p.value))),
        };
      } else if (text) {
        body = { ...body, mode: "raw", raw: text, rawLanguage: "text" };
      }
    }
    result.requests.push({
      id: newId(),
      name: asString(item.name, "Untitled"),
      method: asString(item.method, "GET").toUpperCase(),
      url: asString(item.url),
      params,
      headers,
      body,
      auth: emptyAuth("inherit"),
      collectionId,
      folderId,
      protocol: "http",
      updatedAt: now(),
    });
  }
  for (const item of envs) {
    if (!isRecord(item)) {
      continue;
    }
    const dataBag = isRecord(item.data) ? item.data : {};
    const variables = Object.entries(dataBag).map(([key, value]) => kv(key, String(value ?? ""), true));
    if (variables.length === 0) {
      continue;
    }
    const ts = now();
    result.environments.push({
      id: newId(),
      name: asString(item.name, "Environment"),
      variables,
      createdAt: ts,
      updatedAt: ts,
    });
  }
  return result;
}

export function importCurlText(input: string): WbImportResult {
  const parsed = parseCurl(input);
  const result = emptyImport("curl");
  const col = collection("cURL import");
  result.collections.push(col);
  result.requests.push({
    id: newId(),
    name: `${parsed.method} ${safePath(parsed.url) || parsed.url}`,
    method: parsed.method,
    url: parsed.url,
    params: [],
    headers: parsed.headers,
    body: parsed.body,
    auth: parsed.auth,
    collectionId: col.id,
    folderId: null,
    protocol: "http",
    updatedAt: now(),
  });
  return result;
}


function importParsedDocument(data: unknown, lowerName: string): WbImportResult {
  if (isRecord(data) && isRecord(data.info) && (asString(data.info.schema).includes("postman") || asString(data.info.schema).includes("getpostman") || Array.isArray(data.item))) {
    return importPostman(data);
  }
  if (isRecord(data) && (data.openapi || data.swagger)) {
    return importOpenApi(data);
  }
  if (isRecord(data) && isRecord(data.log) && Array.isArray(data.log.entries)) {
    return importHar(data);
  }
  if (isRecord(data) && (Array.isArray(data.resources) || data.__export_format || data._type === "export")) {
    return importInsomnia(data);
  }
  if (lowerName.endsWith(".har")) {
    return importHar(data);
  }
  throw new Error("Unrecognized collection or request format");
}

export function importAny(input: string, filename?: string): WbImportResult {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Nothing to import");
  }
  const lowerName = (filename ?? "").toLowerCase();
  if (trimmed.startsWith("curl ") || trimmed.startsWith("curl\t") || /^curl\s/m.test(trimmed.split("\n")[0] ?? "")) {
    return importCurlText(trimmed);
  }
  const isYamlName = lowerName.endsWith(".yaml") || lowerName.endsWith(".yml");
  try {
    const data: unknown = isYamlName && !trimmed.startsWith("{") && !trimmed.startsWith("[")
      ? parseYaml(trimmed)
      : JSON.parse(trimmed);
    return importParsedDocument(data, lowerName);
  } catch (error) {
    if (isYamlName || looksLikeYamlOpenApi(trimmed)) {
      try {
        return importParsedDocument(parseYaml(trimmed), lowerName);
      } catch (yamlError) {
        const message = yamlError instanceof Error ? yamlError.message : String(yamlError);
        throw new Error(`Could not parse OpenAPI YAML: ${message}`);
      }
    }
    if (error instanceof Error && error.message.startsWith("Not a")) {
      throw error;
    }
  }
  if (trimmed.includes("curl ")) {
    return importCurlText(trimmed);
  }
  throw new Error("Unrecognized collection or request format");
}

export function exportPostmanCollection(
  col: WbCollection,
  folders: WbFolder[],
  requests: WbRequest[],
): Record<string, unknown> {
  const children = (parentId: string | null): unknown[] => {
    const items: unknown[] = [];
    for (const child of folders.filter((item) => item.collectionId === col.id && item.parentId === parentId)) {
      items.push({
        name: child.name,
        item: children(child.id),
        description: child.description,
      });
    }
    for (const req of requests.filter((item) => item.collectionId === col.id && item.folderId === parentId)) {
      items.push(requestToPostman(req));
    }
    return items;
  };
  return {
    info: {
      name: col.name,
      description: col.description,
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    item: children(null),
    variable: col.variables.map((item) => ({ key: item.key, value: item.value, disabled: !item.enabled })),
    auth: authToPostman(col.auth),
  };
}

function requestToPostman(req: WbRequest): Record<string, unknown> {
  const query = req.params.map((item) => ({
    key: item.key,
    value: item.value,
    disabled: !item.enabled,
  }));
  const body = bodyToPostman(req.body);
  const events = [];
  if (req.preRequestScript) {
    events.push({ listen: "prerequest", script: { type: "text/javascript", exec: req.preRequestScript.split("\n") } });
  }
  if (req.testScript) {
    events.push({ listen: "test", script: { type: "text/javascript", exec: req.testScript.split("\n") } });
  }
  return {
    name: req.name,
    request: {
      method: req.method,
      header: req.headers.map((item) => ({ key: item.key, value: item.value, disabled: !item.enabled })),
      url: { raw: query.length ? `${req.url}?${query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join("&")}` : req.url, query },
      body,
      auth: req.auth.type === "inherit" ? undefined : authToPostman(req.auth),
      description: req.description,
    },
    event: events.length ? events : undefined,
  };
}

function bodyToPostman(body: WbBody): Record<string, unknown> | undefined {
  if (body.mode === "none") {
    return undefined;
  }
  if (body.mode === "json") {
    return { mode: "raw", raw: body.json ?? body.raw ?? "", options: { raw: { language: "json" } } };
  }
  if (body.mode === "raw") {
    return { mode: "raw", raw: body.raw ?? "", options: { raw: { language: body.rawLanguage ?? "text" } } };
  }
  if (body.mode === "urlencoded") {
    return {
      mode: "urlencoded",
      urlencoded: (body.urlencoded ?? []).map((item) => ({ key: item.key, value: item.value, disabled: !item.enabled })),
    };
  }
  if (body.mode === "formdata") {
    return {
      mode: "formdata",
      formdata: (body.formdata ?? []).map((item) => ({
        key: item.key,
        value: item.value,
        type: item.kind === "file" ? "file" : "text",
        disabled: !item.enabled,
      })),
    };
  }
  if (body.mode === "graphql") {
    return { mode: "graphql", graphql: body.graphql ?? { query: "", variables: "{}" } };
  }
  return undefined;
}

function authToPostman(auth: WbAuth): Record<string, unknown> | undefined {
  if (auth.type === "none" || auth.type === "inherit") {
    return { type: "noauth" };
  }
  if (auth.type === "bearer") {
    return { type: "bearer", bearer: [{ key: "token", value: auth.bearer?.token ?? "", type: "string" }] };
  }
  if (auth.type === "basic") {
    return {
      type: "basic",
      basic: [
        { key: "username", value: auth.basic?.username ?? "", type: "string" },
        { key: "password", value: auth.basic?.password ?? "", type: "string" },
      ],
    };
  }
  if (auth.type === "apikey") {
    return {
      type: "apikey",
      apikey: [
        { key: "key", value: auth.apikey?.key ?? "", type: "string" },
        { key: "value", value: auth.apikey?.value ?? "", type: "string" },
        { key: "in", value: auth.apikey?.addTo ?? "header", type: "string" },
      ],
    };
  }
  return { type: auth.type };
}
