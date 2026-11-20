export const PRODUCT_NAME = "Lurkwire";
export const PRODUCT_VERSION = "0.1.0";

export type ToolId =
  | "browser"
  | "history"
  | "repeater"
  | "intercept"
  | "ai"
  | "intruder"
  | "decode"
  | "recon"
  | "scanner"
  | "sitemap"
  | "comparer"
  | "logger"
  | "sequencer"
  | "oob"
  | "autorize"
  | "notes"
  | "discover"
  | "graphql"
  | "settings";

export type SidebarPanel =
  | "history"
  | "repeater"
  | "intercept"
  | "ai"
  | "intruder"
  | "decode"
  | "recon"
  | "scanner"
  | "sitemap"
  | "comparer"
  | "logger"
  | "sequencer"
  | "oob"
  | "autorize"
  | "notes"
  | "discover"
  | "graphql";

export type ThemePref = "system" | "light" | "dark";

export type ChromePage = "content" | "settings";

import type { LlmAction, LlmProvider, LlmSettings } from "./llm";
import { DEFAULT_LLM, LLM_PROVIDERS } from "./llm";

export type { LlmAction, LlmConnectorConfig, LlmProvider, LlmSettings } from "./llm";
export { DEFAULT_LLM, LLM_PROVIDERS };
export type { InteractshInteraction, InteractshState } from "./interactsh";
export { INTERACTSH_SERVERS } from "./interactsh";
import type { TabGroup } from "./tabGroups";
export type { TabGroup, TabGroupColor } from "./tabGroups";
export { TAB_GROUP_COLORS, TAB_GROUP_COLOR_HEX } from "./tabGroups";

export type LlmRequest = {
  action: LlmAction;
  flowId?: string;
  raw?: string;
};

export type LlmResult = {
  text: string;
  redacted: boolean;
  provider: LlmProvider;
  model: string;
  draft?: RepeaterSendRequest;
};

export type AppPrefs = {
  theme: ThemePref;
  bookmarksBar: boolean;
  sidebarOpen: boolean;
  sidebarPanel: SidebarPanel;
  sidebarWidth: number;
  sidebarSide: "left" | "right";
  sessionRestore: boolean;
  llm: LlmSettings;
};

export const DEFAULT_PREFS: AppPrefs = {
  theme: "system",
  bookmarksBar: true,
  sidebarOpen: false,
  sidebarPanel: "history",
  sidebarWidth: 360,
  sidebarSide: "left",
  sessionRestore: false,
  llm: DEFAULT_LLM,
};

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
  favicon: string | null;
  pinned: boolean;
  secure: boolean;
  zoomFactor: number;
  groupId: string | null;
  crashed: boolean;
  failed: boolean;
  audible: boolean;
  muted: boolean;
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

export type FlowAnnotation = {
  note?: string;
  tags?: string[];
};

export type RepeaterSendRequest = {
  project_id?: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  body?: string;
  body_base64?: boolean;
  source?: string;
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
  tabGroups: TabGroup[];
  activeTabId: string | null;
  tool: ToolId;
  error: string | null;
  prefs: AppPrefs;
  killed: boolean;
  chromePage: ChromePage;
  zoomFactor: number;
  theme: "light" | "dark";
  maximized: boolean;
  privateMode: boolean;
};

export type InterceptConfig = {
  enabled: boolean;
  requests: boolean;
  responses: boolean;
  timeout_ms: number;
};

export type PausedItem = {
  id: string;
  direction: "request" | "response";
  created_at: number;
  method: string;
  url: string;
  headers: HeaderPair[];
  body: string | null;
  body_base64: boolean;
  body_len: number;
  status: number | null;
};

export type InterceptState = {
  config: InterceptConfig;
  queue: PausedItem[];
};

export type ForwardEdit = {
  method?: string;
  url?: string;
  headers?: HeaderPair[];
  body?: string;
  body_base64?: boolean;
  status?: number;
};

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Bookmark = {
  id: string;
  title: string;
  url: string;
  createdAt: number;
  folder?: string;
};

export type Visit = {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  count: number;
};

export type DownloadInfo = {
  id: string;
  filename: string;
  url: string;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  receivedBytes: number;
  totalBytes: number;
  path: string | null;
};

export type FindResult = {
  requestId: number;
  activeMatchOrdinal: number;
  matches: number;
  finalUpdate: boolean;
};

export type ContextMenuPayload = {
  kind: "page" | "tab";
  tabId?: string;
  x: number;
  y: number;
  linkURL?: string;
  srcURL?: string;
  pageURL?: string;
  selectionText?: string;
  canCopy: boolean;
  canPaste: boolean;
  canCut: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  hasImage: boolean;
  isEditable: boolean;
  inspectX?: number;
  inspectY?: number;
};

export type PanelKind =
  | "appmenu"
  | "downloads"
  | "alltabs"
  | "identity"
  | "lurkwire"
  | "intercept"
  | "project"
  | "tabmenu"
  | "pagemenu"
  | "groupmenu";

export type PanelAlign = "start" | "end";
export type PanelPlacement = "below" | "above";

export type PanelAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PanelOpenRequest = {
  kind: PanelKind;
  x: number;
  y: number;
  width?: number;
  height?: number;
  payload?: Record<string, unknown>;
  /** Client coordinates relative to the parent window's content area. */
  anchor?: PanelAnchor;
  align?: PanelAlign;
  placement?: PanelPlacement;
};

export type PanelContext = {
  kind: PanelKind;
  payload: Record<string, unknown>;
};

export type ScopeKind = "include" | "exclude";

export type ScopeRule = {
  id: string;
  project_id: string;
  enabled: boolean;
  kind: ScopeKind;
  host: string;
  port: number | null;
  path_prefix: string;
  created_at: number;
};

export type NewScopeRule = {
  project_id?: string;
  enabled?: boolean;
  kind: ScopeKind;
  host: string;
  port?: number | null;
  path_prefix?: string;
};

export type AuditEntry = {
  id: string;
  ts: number;
  actor: string;
  action: string;
  project_id: string | null;
  detail: unknown;
  prev_hash: string;
  hash: string;
};

export type KillState = {
  killed: boolean;
};

export type AttackType = "sniper" | "pitchfork" | "battering_ram";

export type IntruderJobStatus = "running" | "done" | "stopped" | "error";

export type IntruderStart = {
  project_id?: string;
  method: string;
  url: string;
  headers: HeaderPair[];
  body?: string;
  body_base64?: boolean;
  attack: AttackType;
  payloads: string[][];
  grep?: string;
  max_requests?: number;
};

export type IntruderResultRow = {
  index: number;
  position: number | null;
  payload: string;
  status: number | null;
  length: number;
  duration_ms: number;
  grep_hit: boolean;
  flow_id: string | null;
  error: string | null;
};

export type IntruderJob = {
  id: string;
  status: IntruderJobStatus;
  attack: AttackType;
  total: number;
  finished: number;
  results: IntruderResultRow[];
  error: string | null;
  started_at: number;
};

export type Severity = "info" | "low" | "medium" | "high";

export type Finding = {
  id: string;
  project_id: string;
  flow_id: string | null;
  ts: number;
  check_id: string;
  title: string;
  severity: Severity;
  detail: string;
  evidence: string;
  host: string;
  path: string;
  method: string;
  status: number | null;
  count: number;
};

export type FindingQuery = {
  project_id?: string;
  q?: string;
  severity?: string;
  check_id?: string;
  host?: string;
  limit?: number;
  offset?: number;
};

export type FindingList = {
  items: Finding[];
  total: number;
};

