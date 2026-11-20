import { contextBridge, ipcRenderer } from "electron";
import type {
  AppPrefs,
  AppSnapshot,
  Bookmark,
  Bounds,
  DownloadInfo,
  FindResult,
  FlowAnnotation,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  LlmAction,
  LlmProvider,
  InteractshState,
  LlmRequest,
  NewScopeRule,
  PanelContext,
  PanelOpenRequest,
  FindingQuery,
  IntruderStart,
  RepeaterSendRequest,
  ToolId,
  Visit,
} from "../shared/types";
import type { SiteInfo } from "../shared/siteInfo";
import type { InstalledExtension } from "../shared/extensions";
import type { AiMemoryEntry, AiMemoryStore } from "../shared/aiMemory";
import type { ReconRequest, ReconResult } from "../shared/recon";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../shared/types";

function listen<T>(channel: string, callback: (value: T) => void): () => void {
  const listener = (_event: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api = {
  product: PRODUCT_NAME,
  version: PRODUCT_VERSION,
  getState: (): Promise<AppSnapshot> => ipcRenderer.invoke("lurkwire:getState"),
  onState: (callback: (state: AppSnapshot) => void) => listen("lurkwire:state", callback),
  newTab: (url?: string) => ipcRenderer.invoke("lurkwire:newTab", url),
  newWindow: (opts?: { privateMode?: boolean }) => ipcRenderer.invoke("lurkwire:newWindow", opts),
  moveTab: (id: string, beforeId: string | null) => ipcRenderer.invoke("lurkwire:moveTab", id, beforeId),
  closeTab: (id: string) => ipcRenderer.invoke("lurkwire:closeTab", id),
  switchTab: (id: string) => ipcRenderer.invoke("lurkwire:switchTab", id),
  navigate: (url: string) => ipcRenderer.invoke("lurkwire:navigate", url),
  back: () => ipcRenderer.invoke("lurkwire:back"),
  forward: () => ipcRenderer.invoke("lurkwire:forward"),
  reload: () => ipcRenderer.invoke("lurkwire:reload"),
  stop: () => ipcRenderer.invoke("lurkwire:stop"),
  openDevTools: (mode?: "detach" | "bottom" | "right" | "undocked" | "left") =>
    ipcRenderer.invoke("lurkwire:openDevTools", mode),
  inspectElement: (x: number, y: number) => ipcRenderer.invoke("lurkwire:inspectElement", x, y),
  setTool: (tool: ToolId) => ipcRenderer.invoke("lurkwire:setTool", tool),
  setProject: (id: string) => ipcRenderer.invoke("lurkwire:setProject", id),
  createProject: (name: string) => ipcRenderer.invoke("lurkwire:createProject", name),
  reportBounds: (bounds: Bounds) => ipcRenderer.invoke("lurkwire:reportBounds", bounds),
  listFlows: (query: FlowQuery) => ipcRenderer.invoke("lurkwire:listFlows", query),
  getFlow: (id: string) => ipcRenderer.invoke("lurkwire:getFlow", id),
  getFlowBody: (id: string, which: "req" | "resp"): Promise<string> =>
    ipcRenderer.invoke("lurkwire:getFlowBody", id, which),
  patchFlow: (id: string, patch: FlowAnnotation) => ipcRenderer.invoke("lurkwire:patchFlow", id, patch),
  sendRepeater: (req: RepeaterSendRequest) => ipcRenderer.invoke("lurkwire:sendRepeater", req),
  getIntercept: () => ipcRenderer.invoke("lurkwire:getIntercept"),
  setIntercept: (config: InterceptConfig) => ipcRenderer.invoke("lurkwire:setIntercept", config),
  forwardIntercept: (id: string, edit: ForwardEdit) =>
    ipcRenderer.invoke("lurkwire:forwardIntercept", id, edit),
  dropIntercept: (id: string) => ipcRenderer.invoke("lurkwire:dropIntercept", id),
  getPrefs: (): Promise<AppPrefs> => ipcRenderer.invoke("lurkwire:getPrefs"),
  setPrefs: (patch: Partial<AppPrefs>): Promise<AppPrefs> =>
    ipcRenderer.invoke("lurkwire:setPrefs", patch),
  setKillSwitch: (next: boolean) => ipcRenderer.invoke("lurkwire:setKillSwitch", next),
  listScope: (projectId?: string) => ipcRenderer.invoke("lurkwire:listScope", projectId),
  addScope: (rule: NewScopeRule) => ipcRenderer.invoke("lurkwire:addScope", rule),
  deleteScope: (id: string) => ipcRenderer.invoke("lurkwire:deleteScope", id),
  listAudit: (projectId?: string) => ipcRenderer.invoke("lurkwire:listAudit", projectId),
  hasLlmKey: (provider?: LlmProvider): Promise<boolean> => ipcRenderer.invoke("lurkwire:hasLlmKey", provider),
  listLlmKeys: (): Promise<LlmProvider[]> => ipcRenderer.invoke("lurkwire:listLlmKeys"),
  setLlmKey: (key: string, provider?: LlmProvider): Promise<boolean> =>
    ipcRenderer.invoke("lurkwire:setLlmKey", key, provider),
  clearLlmKey: (provider?: LlmProvider) => ipcRenderer.invoke("lurkwire:clearLlmKey", provider),
  listLlmModels: (provider: LlmProvider): Promise<string[]> =>
    ipcRenderer.invoke("lurkwire:listLlmModels", provider),
  testLlmConnection: (provider: LlmProvider): Promise<{ ok: boolean; message: string; models: string[] }> =>
    ipcRenderer.invoke("lurkwire:testLlmConnection", provider),
  llmComplete: (request: LlmRequest) => ipcRenderer.invoke("lurkwire:llmComplete", request),
  getInteractsh: (): Promise<InteractshState> => ipcRenderer.invoke("lurkwire:getInteractsh"),
  registerInteractsh: (server?: string): Promise<InteractshState> =>
    ipcRenderer.invoke("lurkwire:registerInteractsh", server),
  deregisterInteractsh: (): Promise<InteractshState> => ipcRenderer.invoke("lurkwire:deregisterInteractsh"),
  pollInteractsh: (): Promise<InteractshState> => ipcRenderer.invoke("lurkwire:pollInteractsh"),
  newInteractshPayload: (): Promise<InteractshState> => ipcRenderer.invoke("lurkwire:newInteractshPayload"),
  listExtensions: (): Promise<InstalledExtension[]> => ipcRenderer.invoke("lurkwire:listExtensions"),
  addUnpackedExtension: (): Promise<InstalledExtension[] | null> =>
    ipcRenderer.invoke("lurkwire:addUnpackedExtension"),
  removeExtension: (id: string): Promise<InstalledExtension[]> =>
    ipcRenderer.invoke("lurkwire:removeExtension", id),
  listAiMemory: (action?: LlmAction): Promise<AiMemoryEntry[]> =>
    ipcRenderer.invoke("lurkwire:listAiMemory", action),
  clearAiMemory: (action?: LlmAction): Promise<AiMemoryStore> =>
    ipcRenderer.invoke("lurkwire:clearAiMemory", action),
  startIntruder: (req: IntruderStart) => ipcRenderer.invoke("lurkwire:startIntruder", req),
  getIntruder: (id: string) => ipcRenderer.invoke("lurkwire:getIntruder", id),
  listIntruder: () => ipcRenderer.invoke("lurkwire:listIntruder"),
  stopIntruder: (id: string) => ipcRenderer.invoke("lurkwire:stopIntruder", id),
  listFindings: (query: FindingQuery) => ipcRenderer.invoke("lurkwire:listFindings", query),
  getFinding: (id: string) => ipcRenderer.invoke("lurkwire:getFinding", id),
  getSiteInfo: (url: string): Promise<SiteInfo> => ipcRenderer.invoke("lurkwire:getSiteInfo", url),
  listVisits: (query?: string): Promise<Visit[]> => ipcRenderer.invoke("lurkwire:listVisits", query),
  deleteVisit: (id: string): Promise<Visit[]> => ipcRenderer.invoke("lurkwire:deleteVisit", id),
  clearVisits: () => ipcRenderer.invoke("lurkwire:clearVisits"),
  runRecon: (request: ReconRequest): Promise<ReconResult> =>
    ipcRenderer.invoke("lurkwire:runRecon", request),
  hasShodanKey: (): Promise<boolean> => ipcRenderer.invoke("lurkwire:hasShodanKey"),
  setShodanKey: (key: string): Promise<boolean> => ipcRenderer.invoke("lurkwire:setShodanKey", key),
  clearShodanKey: () => ipcRenderer.invoke("lurkwire:clearShodanKey"),
  windowMinimize: () => ipcRenderer.invoke("lurkwire:windowMinimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("lurkwire:windowToggleMaximize"),
  windowClose: () => ipcRenderer.invoke("lurkwire:windowClose"),
  getBookmarks: (): Promise<Bookmark[]> => ipcRenderer.invoke("lurkwire:getBookmarks"),
  addBookmark: (input: { title: string; url: string }): Promise<Bookmark[]> =>
    ipcRenderer.invoke("lurkwire:addBookmark", input),
  removeBookmark: (id: string): Promise<Bookmark[]> =>
    ipcRenderer.invoke("lurkwire:removeBookmark", id),
  onBookmarks: (callback: (items: Bookmark[]) => void) => listen("lurkwire:bookmarks", callback),
  listDownloads: (): Promise<DownloadInfo[]> => ipcRenderer.invoke("lurkwire:listDownloads"),
  cancelDownload: (id: string) => ipcRenderer.invoke("lurkwire:cancelDownload", id),
  showDownload: (id: string) => ipcRenderer.invoke("lurkwire:showDownload", id),
  openDownload: (id: string) => ipcRenderer.invoke("lurkwire:openDownload", id),
  onDownloads: (callback: (items: DownloadInfo[]) => void) => listen("lurkwire:downloads", callback),
  findInPage: (text: string, options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }) =>
    ipcRenderer.invoke("lurkwire:findInPage", text, options),
  stopFindInPage: () => ipcRenderer.invoke("lurkwire:stopFindInPage"),
  onFind: (callback: (result: FindResult) => void) => listen("lurkwire:find", callback),
  setZoom: (factor: number) => ipcRenderer.invoke("lurkwire:setZoom", factor),
  adjustZoom: (delta: number) => ipcRenderer.invoke("lurkwire:adjustZoom", delta),
  resetZoom: () => ipcRenderer.invoke("lurkwire:resetZoom"),
  pinTab: (id: string, pinned: boolean) => ipcRenderer.invoke("lurkwire:pinTab", id, pinned),
  duplicateTab: (id: string) => ipcRenderer.invoke("lurkwire:duplicateTab", id),
  closeOtherTabs: (id: string) => ipcRenderer.invoke("lurkwire:closeOtherTabs", id),
  closeTabsToRight: (id: string) => ipcRenderer.invoke("lurkwire:closeTabsToRight", id),
  reopenTab: () => ipcRenderer.invoke("lurkwire:reopenTab"),
  pageAction: (action: string, url?: string) => ipcRenderer.invoke("lurkwire:pageAction", action, url),
  copyText: (text: string) => ipcRenderer.invoke("lurkwire:copyText", text),
  openExternal: (url: string) => ipcRenderer.invoke("lurkwire:openExternal", url),
  command: (name: string) => ipcRenderer.invoke("lurkwire:command", name),
  openPanel: (request: PanelOpenRequest) => ipcRenderer.invoke("lurkwire:openPanel", request),
  closePanel: () => ipcRenderer.invoke("lurkwire:closePanel"),
  resizePanel: (width: number, height: number) =>
    ipcRenderer.invoke("lurkwire:resizePanel", width, height),
  getPanelContext: (): Promise<PanelContext | null> => ipcRenderer.invoke("lurkwire:getPanelContext"),
  requestFind: () => ipcRenderer.invoke("lurkwire:requestFind"),
  onFocusUrl: (callback: () => void) => listen("lurkwire:focus-url", callback),
  onOpenFind: (callback: () => void) => listen("lurkwire:open-find", callback),
  onEscape: (callback: () => void) => listen("lurkwire:escape", callback),
};

contextBridge.exposeInMainWorld("lurkwire", api);

export type LurkwireApi = typeof api;
