export const PRODUCT_NAME = "Lurkwire";
export const PRODUCT_VERSION = "0.1.0";

export type ToolId = "browser" | "history" | "repeater";

export type ProxyStatus = "starting" | "ready" | "down";

export type Project = {
  id: string;
  name: string;
  created_at: number;
};

export type TabInfo = {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  projectId: string;
};

export type HeaderPair = {
  name: string;
  value: string;
};

export type FlowSummary = {
  id: string;
  project_id: string;
  ts: number;
  method: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  query: string;
  url: string;
  http_version: string;
  status: number | null;
  req_len: number;
  resp_len: number;
  duration_ms: number | null;
  source: string;
  mime: string | null;
  in_scope: boolean;
  truncated: boolean;
  tags: string[];
  note: string;
};

export type FlowDetail = FlowSummary & {
  req_headers: HeaderPair[];
  resp_headers: HeaderPair[];
  req_blob: string | null;
  resp_blob: string | null;
  req_preview: string | null;
  resp_preview: string | null;
};

export type FlowQuery = {
  project_id?: string;
  q?: string;
  method?: string;
  host?: string;
  status?: number;
  source?: string;
  hide_static?: boolean;
  limit?: number;
  offset?: number;
};

export type FlowList = {
  items: FlowSummary[];
  total: number;
};

export type RepeaterSendRequest = {
  project_id?: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  body?: string;
  body_base64?: boolean;
};

export type AppSnapshot = {
  product: string;
  version: string;
  proxy: {
    status: ProxyStatus;
    listen?: string;
    control?: string;
    caPath?: string;
    fingerprint?: string;
  };
  projects: Project[];
  currentProjectId: string | null;
  tabs: TabInfo[];
  activeTabId: string | null;
  tool: ToolId;
  error: string | null;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};
