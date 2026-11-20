import type { FlowDetail, RepeaterSendRequest } from "../../shared/types";
import { newId, requestFromFlow, type WbRequest, type WbWorkspace } from "../../shared/workbench";
import { emptyAuth } from "../../shared/workbench";
import { loadWorkspace, peekWorkspaceMasked, saveWorkspace } from "./store";
import { sendWorkbenchRequest, type WorkbenchTransport } from "./send";

export { peekWorkspaceMasked, saveWorkspace, loadWorkspace } from "./store";
export { sendWorkbenchRequest } from "./send";
export type { WorkbenchTransport } from "./send";

export function getMaskedWorkspace(): WbWorkspace {
  return peekWorkspaceMasked();
}

export function putWorkspace(workspace: WbWorkspace): WbWorkspace {
  return saveWorkspace(workspace);
}

export async function importFlowToWorkbench(
  flow: FlowDetail,
  bodyText: string | undefined,
): Promise<{ workspace: WbWorkspace; request: WbRequest }> {
  const workspace = loadWorkspace();
  let collection = workspace.collections.find((item) => item.name === "Captured");
  if (!collection) {
    const ts = Date.now();
    collection = {
      id: newId(),
      name: "Captured",
      description: "Requests sent here from History, Repeater, or Intruder.",
      variables: [],
      auth: emptyAuth("none"),
      createdAt: ts,
      updatedAt: ts,
    };
    workspace.collections.unshift(collection);
  }
  const request: WbRequest = {
    ...requestFromFlow(flow, bodyText),
    id: newId(),
    collectionId: collection.id,
    updatedAt: Date.now(),
  };
  workspace.requests.push(request);
  saveWorkspace(workspace);
  return { workspace: peekWorkspaceMasked(), request };
}

export function transportFrom(control: {
  sendWorkbench: (req: RepeaterSendRequest) => Promise<FlowDetail>;
  getFlowBody: (id: string, which: "req" | "resp") => Promise<ArrayBuffer>;
}, projectId: () => string | null): WorkbenchTransport {
  return {
    send: (req) => control.sendWorkbench(req),
    getBody: (id, which) => control.getFlowBody(id, which),
    projectId,
  };
}

export async function sendFromWorkbench(
  draft: WbRequest,
  transport: WorkbenchTransport,
): Promise<ReturnType<typeof sendWorkbenchRequest>> {
  return sendWorkbenchRequest(draft, transport);
}
