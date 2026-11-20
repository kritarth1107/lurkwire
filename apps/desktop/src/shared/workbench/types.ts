import type { MatchRule } from "./matchReplace";
export type WbMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT";

export const WB_METHODS: WbMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "TRACE",
  "CONNECT",
];

export type WbKv = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  description?: string;
  secret?: boolean;
  /** True when a secret is stored in the main-process vault but not sent to the renderer. */
  secretSet?: boolean;
};

export type WbFormField = WbKv & {
  kind?: "text" | "file";
  fileName?: string;
  fileBase64?: string;
  mime?: string;
};

export type WbBodyMode = "none" | "raw" | "json" | "urlencoded" | "formdata" | "graphql" | "binary";

export type WbRawLanguage = "json" | "xml" | "text" | "html" | "javascript";

export type WbBody = {
  mode: WbBodyMode;
  raw?: string;
  rawLanguage?: WbRawLanguage;
  json?: string;
  urlencoded?: WbKv[];
  formdata?: WbFormField[];
  graphql?: { query: string; variables: string };
  binary?: { fileName: string; base64: string; mime?: string };
};

export type WbAuthType =
  | "none"
  | "inherit"
  | "bearer"
  | "basic"
  | "apikey"
  | "jwt"
  | "digest"
  | "oauth2"
  | "awsv4";

export type WbOAuth2 = {
  grant: "authorization_code" | "client_credentials";
  accessToken?: string;
  refreshToken?: string;
  tokenUrl?: string;
  authUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  audience?: string;
  pkce?: boolean;
  addTo?: "header" | "query";
};

export type WbAwsV4 = {
  accessKey: string;
  secretKey: string;
  region: string;
  service: string;
  sessionToken?: string;
};

export type WbAuth = {
  type: WbAuthType;
  bearer?: { token: string };
  basic?: { username: string; password: string };
  apikey?: { key: string; value: string; addTo: "header" | "query" };
  jwt?: { token: string; headerName?: string };
  digest?: { username: string; password: string };
  oauth2?: WbOAuth2;
  awsv4?: WbAwsV4;
};

export type WbProtocol = "http" | "websocket" | "sse" | "grpc";

export type WbRequest = {
  id: string;
  name: string;
  description?: string;
  method: string;
  url: string;
  params: WbKv[];
  headers: WbKv[];
  body: WbBody;
  auth: WbAuth;
  preRequestScript?: string;
  testScript?: string;
  collectionId: string;
  folderId: string | null;
  protocol?: WbProtocol;
  ws?: { protocols?: string };
  grpc?: { service?: string; method?: string; proto?: string; metadata?: WbKv[] };
  updatedAt: number;
};

export type WbFolder = {
  id: string;
  name: string;
  collectionId: string;
  parentId: string | null;
  description?: string;
};

export type WbCollection = {
  id: string;
  name: string;
  description?: string;
  variables: WbKv[];
  auth: WbAuth;
  createdAt: number;
  updatedAt: number;
};

export type WbEnvironment = {
  id: string;
  name: string;
  variables: WbKv[];
  createdAt: number;
  updatedAt: number;
};

export type WbHistoryEntry = {
  id: string;
  at: number;
  requestId?: string;
  name?: string;
  method: string;
  url: string;
  status: number | null;
  durationMs: number | null;
  size: number | null;
  flowId?: string;
  error?: string;
};

export type WbCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number | null;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

export type WbWorkspace = {
  version: 1;
  collections: WbCollection[];
  folders: WbFolder[];
  requests: WbRequest[];
  environments: WbEnvironment[];
  globals: WbKv[];
  activeEnvironmentId: string | null;
  history: WbHistoryEntry[];
  cookies: WbCookie[];
  matchRules: MatchRule[];
};

export type WbTabKind = WbProtocol;

export type WbTab = {
  id: string;
  kind: WbTabKind;
  requestId: string | null;
  draft: WbRequest;
  dirty: boolean;
};

export type WbTestResult = {
  name: string;
  passed: boolean;
  error?: string;
};

export type WbSendResult = {
  status: number | null;
  durationMs: number | null;
  size: number | null;
  flowId?: string;
  error?: string;
  tests: WbTestResult[];
  logs: string[];
  responseText?: string;
  responseHeaders?: { name: string; value: string }[];
};

export type WbImportSource = "postman" | "insomnia" | "openapi" | "har" | "curl" | "unknown";

export type WbImportResult = {
  collections: WbCollection[];
  folders: WbFolder[];
  requests: WbRequest[];
  environments: WbEnvironment[];
  warnings: string[];
  source: WbImportSource;
};

export function emptyBody(): WbBody {
  return {
    mode: "none",
    raw: "",
    rawLanguage: "json",
    json: "",
    urlencoded: [],
    formdata: [],
    graphql: { query: "", variables: "{}" },
  };
}

export function emptyAuth(type: WbAuthType = "inherit"): WbAuth {
  return { type };
}

export function emptyWorkspace(): WbWorkspace {
  return {
    version: 1,
    collections: [],
    folders: [],
    requests: [],
    environments: [],
    globals: [],
    activeEnvironmentId: null,
    history: [],
    cookies: [],
    matchRules: [],
  };
}
