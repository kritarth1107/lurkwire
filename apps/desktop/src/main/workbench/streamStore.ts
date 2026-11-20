import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import {
  emptyStreamHistory,
  type StreamFrame,
  type StreamHistoryStore,
  type StreamKind,
  type StreamSessionRecord,
} from "../../shared/workbench/streamHistory";

const MAX_SESSIONS = 80;
const MAX_FRAMES = 400;

function pathOf(): string {
  return join(app.getPath("userData"), "workbench", "streams.json");
}

export function loadStreamHistory(): StreamHistoryStore {
  const file = pathOf();
  if (!existsSync(file)) {
    return emptyStreamHistory();
  }
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as StreamHistoryStore;
    return { version: 1, sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [] };
  } catch {
    return emptyStreamHistory();
  }
}

function save(store: StreamHistoryStore): StreamHistoryStore {
  const file = pathOf();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(store));
  return store;
}

export function startStreamRecord(input: {
  id: string;
  kind: StreamKind;
  url: string;
  title?: string;
  requestId?: string;
}): StreamSessionRecord {
  const record: StreamSessionRecord = {
    id: input.id,
    kind: input.kind,
    url: input.url,
    title: input.title,
    startedAt: Date.now(),
    requestId: input.requestId,
    frames: [],
  };
  const store = loadStreamHistory();
  store.sessions = [record, ...store.sessions.filter((item) => item.id !== record.id)].slice(0, MAX_SESSIONS);
  save(store);
  return record;
}

export function appendStreamFrame(sessionId: string, frame: StreamFrame): void {
  const store = loadStreamHistory();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  session.frames = [...session.frames, frame].slice(-MAX_FRAMES);
  save(store);
}

export function endStreamRecord(sessionId: string): void {
  const store = loadStreamHistory();
  const session = store.sessions.find((item) => item.id === sessionId);
  if (!session) {
    return;
  }
  session.endedAt = Date.now();
  save(store);
}

export function clearStreamHistory(): StreamHistoryStore {
  return save(emptyStreamHistory());
}

export function getStreamSession(id: string): StreamSessionRecord | null {
  return loadStreamHistory().sessions.find((item) => item.id === id) ?? null;
}
