import type { FlowDetail } from "../../shared/types";
import type { SendTarget } from "../../shared/sendTo";
import { toolForSendTarget } from "../../shared/sendTo";
import { addComparerItem } from "./workbench";
import { queueIntruderDraft, queueRepeaterDraft, queueScannerDraft, queueParamMinerDraft } from "./workbench/pendingSend";
import { setSelectedFlow } from "./flowSelection";
import { addFlowHostToScope, copyFlowCurl, copyFlowFetch } from "./FlowActions";

export async function dispatchSend(flow: FlowDetail, target: SendTarget): Promise<void> {
  setSelectedFlow(flow);
  if (target === "repeater") {
    queueRepeaterDraft(flow);
  } else if (target === "intruder") {
    queueIntruderDraft(flow);
  } else if (target === "scanner") {
    queueScannerDraft(flow);
  } else if (target === "comparer") {
    addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
  } else if (target === "workbench") {
    const imported = await window.lurkwire.workbenchImportFlow(flow.id);
    await window.lurkwire.navigate(`lurkwire://workbench#${imported.request.id}`);
    return;
  }
  const tool = toolForSendTarget(target);
  if (tool !== "workbench") {
    await window.lurkwire.setTool(tool);
  }
}

export async function copyUrlOf(flow: FlowDetail): Promise<void> {
  await window.lurkwire.copyText(flow.url);
}

export async function copyCurlOf(flow: FlowDetail): Promise<void> {
  await copyFlowCurl(flow.id);
}

export async function copyFetchOf(flow: FlowDetail): Promise<void> {
  await copyFlowFetch(flow.id);
}

export async function addToScope(flow: FlowDetail): Promise<void> {
  await addFlowHostToScope(flow.id);
}

export function sendToParamMiner(flow: FlowDetail): void {
  setSelectedFlow(flow);
  queueParamMinerDraft(flow);
  void window.lurkwire.setTool("paramminer");
}
