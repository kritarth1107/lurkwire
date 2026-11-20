import { contextBridge, ipcRenderer } from "electron";
import type {
  AppPrefs,
  AppSnapshot,
  Bookmark,
  Bounds,
  DownloadInfo,
  FindResult,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  LlmRequest,
  NewScopeRule,
  PanelContext,
  PanelOpenRequest,
  IntruderStart,
  RepeaterSendRequest,
  ToolId,
} from "../shared/types";
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
  closeTab: (id: string) => ipcRenderer.invoke("lurkwire:closeTab", id),
  switchTab: (id: string) => ipcRenderer.invoke("lurkwire:switchTab", id),
  navigate: (url: string) => ipcRenderer.invoke("lurkwire:navigate", url),
  back: () => ipcRenderer.invoke("lurkwire:back"),
  forward: () => ipcRenderer.invoke("lurkwire:forward"),
  reload: () => ipcRenderer.invoke("lurkwire:reload"),
  stop: () => ipcRenderer.invoke("lurkwire:stop"),
  openDevTools: () => ipcRenderer.invoke("lurkwire:openDevTools"),
  setTool: (tool: ToolId) => ipcRenderer.invoke("lurkwire:setTool", tool),
  setProject: (id: string) => ipcRenderer.invoke("lurkwire:setProject", id),
  createProject: (name: string) => ipcRenderer.invoke("lurkwire:createProject", name),
  reportBounds: (bounds: Bounds) => ipcRenderer.invoke("lurkwire:reportBounds", bounds),
  listFlows: (query: FlowQuery) => ipcRenderer.invoke("lurkwire:listFlows", query),
  getFlow: (id: string) => ipcRenderer.invoke("lurkwire:getFlow", id),
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
  hasLlmKey: (): Promise<boolean> => ipcRenderer.invoke("lurkwire:hasLlmKey"),
  setLlmKey: (key: string): Promise<boolean> => ipcRenderer.invoke("lurkwire:setLlmKey", key),
  clearLlmKey: () => ipcRenderer.invoke("lurkwire:clearLlmKey"),
  llmComplete: (request: LlmRequest) => ipcRenderer.invoke("lurkwire:llmComplete", request),
  startIntruder: (req: IntruderStart) => ipcRenderer.invoke("lurkwire:startIntruder", req),
  getIntruder: (id: string) => ipcRenderer.invoke("lurkwire:getIntruder", id),
  listIntruder: () => ipcRenderer.invoke("lurkwire:listIntruder"),
  stopIntruder: (id: string) => ipcRenderer.invoke("lurkwire:stopIntruder", id),
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
