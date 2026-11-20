import { newId } from "./id";
import { kv } from "./kv";
import type { WbCollection, WbEnvironment, WbRequest, WbWorkspace } from "./types";
import { emptyAuth, emptyBody, emptyWorkspace } from "./types";

export function starterWorkspace(): WbWorkspace {
  const ts = Date.now();
  const collectionId = newId();
  const envId = newId();
  const collection: WbCollection = {
    id: collectionId,
    name: "httpbin",
    description: "Starter requests against httpbin.org, used to try Workbench safely.",
    variables: [kv("baseUrl", "https://httpbin.org")],
    auth: emptyAuth("none"),
    createdAt: ts,
    updatedAt: ts,
  };
  const environment: WbEnvironment = {
    id: envId,
    name: "Local",
    variables: [kv("baseUrl", "https://httpbin.org"), kv("token", "change-me", true, { secret: true })],
    createdAt: ts,
    updatedAt: ts,
  };
  const requests: WbRequest[] = [
    req(collectionId, "GET echo", "GET", "{{baseUrl}}/get", { source: "lurkwire-workbench" }),
    req(collectionId, "Headers", "GET", "{{baseUrl}}/headers"),
    req(collectionId, "POST JSON", "POST", "{{baseUrl}}/post", undefined, {
      ...emptyBody(),
      mode: "json",
      json: '{\n  "ok": true,\n  "from": "lurkwire"\n}',
      rawLanguage: "json",
    }),
    req(collectionId, "Status 418", "GET", "{{baseUrl}}/status/418"),
    req(collectionId, "UUID", "GET", "{{baseUrl}}/uuid"),
  ];
  const workspace = emptyWorkspace();
  workspace.collections = [collection];
  workspace.requests = requests;
  workspace.environments = [environment];
  workspace.activeEnvironmentId = envId;
  return workspace;
}

function req(
  collectionId: string,
  name: string,
  method: string,
  url: string,
  query?: Record<string, string>,
  body = emptyBody(),
): WbRequest {
  return {
    id: newId(),
    name,
    method,
    url,
    params: query ? Object.entries(query).map(([key, value]) => kv(key, value)) : [],
    headers: [kv("Accept", "application/json")],
    body,
    auth: emptyAuth("inherit"),
    collectionId,
    folderId: null,
    protocol: "http",
    testScript: 'pm.test("status is not a server error", () => {\n  pm.expect(pm.response.code).to.be.ok;\n});\n',
    updatedAt: Date.now(),
  };
}
