import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import type { LlmAction } from "../shared/types";
import {
  clip,
  formatMemoryPrompt,
  MEMORY_INPUT_CHARS,
  MEMORY_OUTPUT_CHARS,
  MEMORY_PER_TASK,
  type AiMemoryEntry,
  type AiMemoryStore,
} from "../shared/aiMemory";

function memoryPath(): string {
  return join(app.getPath("userData"), "ai-memory.json");
}

export function loadAiMemory(): AiMemoryStore {
  try {
    if (!existsSync(memoryPath())) {
      return {};
    }
    const parsed = JSON.parse(readFileSync(memoryPath(), "utf8")) as AiMemoryStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAiMemory(store: AiMemoryStore) {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(memoryPath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export function listAiMemory(action?: LlmAction): AiMemoryEntry[] {
  const store = loadAiMemory();
  if (action) {
    return store[action] ?? [];
  }
  return Object.values(store).flat().sort((a, b) => b.ts - a.ts);
}

export function memoryPromptFor(action: LlmAction): string {
  return formatMemoryPrompt(listAiMemory(action));
}

export function appendAiMemory(entry: Omit<AiMemoryEntry, "id" | "ts"> & { ts?: number }): AiMemoryEntry[] {
  const store = loadAiMemory();
  const list = store[entry.action] ?? [];
  const saved: AiMemoryEntry = {
    id: randomUUID(),
    ts: entry.ts ?? Date.now(),
    action: entry.action,
    input: clip(entry.input, MEMORY_INPUT_CHARS),
    output: clip(entry.output, MEMORY_OUTPUT_CHARS),
    model: entry.model,
    provider: entry.provider,
  };
  store[entry.action] = [...list, saved].slice(-MEMORY_PER_TASK);
  saveAiMemory(store);
  return store[entry.action];
}

export function clearAiMemory(action?: LlmAction): AiMemoryStore {
  if (!action) {
    saveAiMemory({});
    return {};
  }
  const store = loadAiMemory();
  delete store[action];
  saveAiMemory(store);
  return store;
}
