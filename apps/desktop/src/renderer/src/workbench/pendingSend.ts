import type { FlowDetail } from "../../../shared/types";

let repeater: FlowDetail | null = null;
let intruder: FlowDetail | null = null;

export function queueRepeaterDraft(flow: FlowDetail): void {
  repeater = flow;
}

export function takeRepeaterDraft(): FlowDetail | null {
  const value = repeater;
  repeater = null;
  return value;
}

export function queueIntruderDraft(flow: FlowDetail): void {
  intruder = flow;
}

export function takeIntruderDraft(): FlowDetail | null {
  const value = intruder;
  intruder = null;
  return value;
}

let scanner: FlowDetail | null = null;
let paramMiner: FlowDetail | null = null;

export function queueScannerDraft(flow: FlowDetail): void {
  scanner = flow;
}

export function takeScannerDraft(): FlowDetail | null {
  const value = scanner;
  scanner = null;
  return value;
}

export function queueParamMinerDraft(flow: FlowDetail): void {
  paramMiner = flow;
}

export function takeParamMinerDraft(): FlowDetail | null {
  const value = paramMiner;
  paramMiner = null;
  return value;
}
