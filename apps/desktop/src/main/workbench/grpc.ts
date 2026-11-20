import type { ControlClient } from "../control";
import { parseGrpcTarget } from "../../shared/workbench/protoParse";
import { newId } from "../../shared/workbench";
import { assertActiveAllowed } from "../../shared/scope";
import { describeProto, invokeGrpc, reflectProto, type GrpcEvent, type GrpcInvokeInput } from "./grpcClient";
import { appendStreamFrame, endStreamRecord, startStreamRecord } from "./streamStore";

export { describeProto, reflectProto };

async function guard(control: ControlClient, target: string, projectId?: string | null): Promise<void> {
  const kill = await control.getKill();
  if (kill.killed) {
    throw new Error("The kill switch is on.");
  }
  const parsed = parseGrpcTarget(target);
  const rules = await control.listScope(projectId ?? undefined);
  assertActiveAllowed(rules, `http://${parsed.authority}/`);
}

export async function runGrpcCall(
  input: GrpcInvokeInput & { projectId?: string | null; requestId?: string },
  control: ControlClient,
  onEvent?: (event: GrpcEvent & { sessionId: string }) => void,
): Promise<{ sessionId: string; error?: string }> {
  await guard(control, input.target, input.projectId);
  const sessionId = newId();
  startStreamRecord({
    id: sessionId,
    kind: "grpc",
    url: `${input.target} ${input.service}/${input.method}`,
    title: `${input.service}/${input.method}`,
    requestId: input.requestId,
  });
  const result = await invokeGrpc(input, (event) => {
    const frame = { sessionId, id: newId(), at: Date.now(), dir: event.dir, text: event.text };
    appendStreamFrame(sessionId, frame);
    onEvent?.({ ...event, sessionId });
  });
  endStreamRecord(sessionId);
  return { sessionId, error: result.error };
}
