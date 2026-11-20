export type StreamKind = "websocket" | "sse" | "grpc";

export type StreamFrame = {
  sessionId: string;
  id: string;
  at: number;
  dir: "in" | "out" | "sys";
  text: string;
};

export type StreamSessionRecord = {
  id: string;
  kind: StreamKind;
  url: string;
  title?: string;
  startedAt: number;
  endedAt?: number;
  requestId?: string;
  frames: StreamFrame[];
};

export type StreamHistoryStore = {
  version: 1;
  sessions: StreamSessionRecord[];
};

export function emptyStreamHistory(): StreamHistoryStore {
  return { version: 1, sessions: [] };
}
