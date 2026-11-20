import type { ControlClient } from "../control";
import { assertActiveAllowed } from "../../shared/scope";
import { newId } from "../../shared/workbench";

export type StreamKind = "websocket" | "sse";

export type StreamFrame = {
  sessionId: string;
  id: string;
  at: number;
  dir: "in" | "out" | "sys";
  text: string;
};

export type StreamOpen = {
  kind: StreamKind;
  url: string;
  protocols?: string;
  headers?: { name: string; value: string }[];
  projectId?: string | null;
};

type Session = {
  id: string;
  kind: StreamKind;
  url: string;
  ws?: WebSocket;
  abort?: AbortController;
};

const sessions = new Map<string, Session>();

export type StreamEmitter = (frame: StreamFrame) => void;

function checkUrl(url: string): string {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return `http${url.slice(2)}`;
  }
  return url;
}

async function guard(control: ControlClient, url: string, projectId?: string | null): Promise<void> {
  const kill = await control.getKill();
  if (kill.killed) {
    throw new Error("The kill switch is on.");
  }
  const rules = await control.listScope(projectId ?? undefined);
  assertActiveAllowed(rules, checkUrl(url));
}

function emit(push: StreamEmitter, sessionId: string, dir: StreamFrame["dir"], text: string): StreamFrame {
  const frame: StreamFrame = { sessionId, id: newId(), at: Date.now(), dir, text };
  push(frame);
  return frame;
}

function headerMap(headers?: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers ?? []) {
    if (header.name) {
      out[header.name] = header.value;
    }
  }
  return out;
}

export async function openStream(input: StreamOpen, control: ControlClient, push: StreamEmitter): Promise<{ id: string; kind: StreamKind; url: string }> {
  await guard(control, input.url, input.projectId);
  const id = newId();
  const session: Session = { id, kind: input.kind, url: input.url };
  sessions.set(id, session);
  if (input.kind === "websocket") {
    const protocols = input.protocols?.split(",").map((item) => item.trim()).filter(Boolean);
    const ws = protocols && protocols.length ? new WebSocket(input.url, protocols) : new WebSocket(input.url);
    session.ws = ws;
    ws.addEventListener("open", () => emit(push, id, "sys", "Connected"));
    ws.addEventListener("message", (event) => {
      const text = typeof event.data === "string" ? event.data : String(event.data);
      emit(push, id, "in", text);
    });
    ws.addEventListener("error", () => emit(push, id, "sys", "WebSocket error"));
    ws.addEventListener("close", (event) => {
      emit(push, id, "sys", `Closed (${event.code}${event.reason ? ` ${event.reason}` : ""})`);
      sessions.delete(id);
    });
  } else {
    const abort = new AbortController();
    session.abort = abort;
    void (async () => {
      try {
        const response = await fetch(input.url, { headers: headerMap(input.headers), signal: abort.signal });
        emit(push, id, "sys", `SSE ${response.status} ${response.statusText}`);
        if (!response.body) {
          emit(push, id, "sys", "The response has no body.");
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const data = part
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            const eventName = part.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
            if (data || eventName) {
              emit(push, id, "in", eventName ? `[${eventName}] ${data}` : data);
            }
          }
        }
        emit(push, id, "sys", "Stream ended");
      } catch (error) {
        if (!abort.signal.aborted) {
          emit(push, id, "sys", error instanceof Error ? error.message : String(error));
        }
      } finally {
        sessions.delete(id);
      }
    })();
  }
  return { id, kind: input.kind, url: input.url };
}

export function sendStream(id: string, text: string, push: StreamEmitter): void {
  const session = sessions.get(id);
  if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) {
    throw new Error("The WebSocket is not connected.");
  }
  session.ws.send(text);
  emit(push, id, "out", text);
}

export function closeStream(id: string): void {
  const session = sessions.get(id);
  if (!session) {
    return;
  }
  session.abort?.abort();
  session.ws?.close();
  sessions.delete(id);
}

export function closeAllStreams(): void {
  for (const id of [...sessions.keys()]) {
    closeStream(id);
  }
}
