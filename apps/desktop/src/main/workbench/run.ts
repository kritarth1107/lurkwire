import type { RunnerProgress, RunnerSpec, WbRequest } from "../../shared/workbench";
import { loadWorkspace } from "./store";
import { sendWorkbenchRequest, type WorkbenchTransport } from "./send";

export async function runWorkbenchCollection(
  spec: RunnerSpec,
  transport: WorkbenchTransport,
  onProgress?: (item: RunnerProgress) => void,
): Promise<RunnerProgress[]> {
  const workspace = loadWorkspace();
  const requests = spec.requestIds
    .map((id) => workspace.requests.find((item) => item.id === id))
    .filter((item): item is WbRequest => Boolean(item));
  const rows = spec.data && spec.data.length > 0 ? spec.data : [{}];
  const total = requests.length * rows.length;
  const out: RunnerProgress[] = [];
  let index = 0;
  for (const row of rows) {
    for (const request of requests) {
      const result = await sendWorkbenchRequest(request, transport, {
        persist: true,
        extraVars: row,
      });
      index += 1;
      const item: RunnerProgress = {
        index,
        total,
        requestId: request.id,
        name: request.name,
        row,
        result,
      };
      out.push(item);
      onProgress?.(item);
      const failed = Boolean(result.error) || (result.status != null && result.status >= 500) || result.tests.some((test) => !test.passed);
      if (spec.stopOnFail && failed) {
        return out;
      }
      if (spec.delayMs && spec.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, spec.delayMs));
      }
    }
  }
  return out;
}

