import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  Bounds,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  RepeaterSendRequest,
  ToolId,
} from "../shared/types";
import { PRODUCT_NAME, PRODUCT_VERSION } from "../shared/types";

const api = {
  product: PRODUCT_NAME,
  version: PRODUCT_VERSION,
  getState: (): Promise<AppSnapshot> => ipcRenderer.invoke("lurkwire:getState"),
  onState: (callback: (state: AppSnapshot) => void) => {
    const listener = (_event: unknown, state: AppSnapshot) => callback(state);
    ipcRenderer.on("lurkwire:state", listener);
    return () => {
      ipcRenderer.removeListener("lurkwire:state", listener);
    };
  },
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
};

contextBridge.exposeInMainWorld("lurkwire", api);

export type LurkwireApi = typeof api;
