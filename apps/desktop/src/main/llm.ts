import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type {
  FlowDetail,
  HeaderPair,
  LlmRequest,
  LlmResult,
  LlmSettings,
  RepeaterSendRequest,
} from "../shared/types";
import { DEFAULT_LLM } from "../shared/types";
import { isLocalLlmUrl, redactForCloud } from "../shared/redact";

const DEFAULTS: Record<LlmSettings["provider"], { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-20250514" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2" },
  "openai-compatible": { baseUrl: "", model: "" },
};

function keyPath(): string {
  return join(app.getPath("userData"), "llm-key.bin");
}

export function hasLlmKey(): boolean {
  return existsSync(keyPath());
}

export function saveLlmKey(secret: string): void {
  const trimmed = secret.trim();
  if (!trimmed) {
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS key encryption is unavailable, so the API key was not saved.");
  }
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(keyPath(), safeStorage.encryptString(trimmed));
}

export function clearLlmKey(): void {
  if (existsSync(keyPath())) {
    unlinkSync(keyPath());
  }
}

function loadLlmKey(): string | null {
  if (!existsSync(keyPath()) || !safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    return safeStorage.decryptString(readFileSync(keyPath()));
  } catch {
    return null;
  }
}

function normalizeSettings(input: LlmSettings | undefined): LlmSettings {
  const settings = { ...DEFAULT_LLM, ...input };
  const fallback = DEFAULTS[settings.provider];
  return {
    ...settings,
    baseUrl: (settings.baseUrl || fallback.baseUrl).replace(/\/+$/, ""),
    model: settings.model || fallback.model,
  };
}

function systemPrompt(action: LlmRequest["action"]): string {
  const common =
    "You are a senior application-security assistant inside Lurkwire. Be concise and practical. Never claim you sent a request yourself; a human always sends.";
  if (action === "explain") {
    return `${common} Explain the HTTP exchange: what it does, interesting headers, and likely security implications.`;
  }
  if (action === "suggest") {
    return `${common} Suggest concrete tests a human might run next (auth, injection, access control, serialization). Do not include real secrets.`;
  }
  return `${common} Draft a follow-up HTTP request. Respond with a short rationale, then a single JSON object in a fenced block with keys method, url, headers (array of {name,value}), and body (string). The human will review and send it from Repeater.`;
}

function formatFlow(flow: FlowDetail): string {
  const req = [flow.method, flow.url, ...flow.req_headers.map((h) => `${h.name}: ${h.value}`)].join("\n");
  const resp = [
    flow.status ? `HTTP ${flow.status}` : "",
    ...flow.resp_headers.map((h) => `${h.name}: ${h.value}`),
    flow.resp_preview ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  return `Request:\n${req}\n\nRequest body:\n${flow.req_preview ?? ""}\n\nResponse:\n${resp}`;
}

export async function completeLlm(
  settingsInput: LlmSettings,
  request: LlmRequest,
  getFlow: (id: string) => Promise<FlowDetail>,
): Promise<LlmResult> {
  const settings = normalizeSettings(settingsInput);
  if (settings.localOnly && !isLocalLlmUrl(settings.baseUrl)) {
    throw new Error("Local-only mode is on. Set a loopback endpoint such as Ollama, or turn local-only off.");
  }
  const key = loadLlmKey();
  if (settings.provider !== "ollama" && !key) {
    throw new Error("Add an API key in Settings before using a cloud model.");
  }

  let raw = request.raw?.trim() ?? "";
  if (request.flowId) {
    const flow = await getFlow(request.flowId);
    raw = [raw, formatFlow(flow)].filter(Boolean).join("\n\n");
  }
  if (!raw) {
    throw new Error("Select a history item or paste a request first.");
  }

  const shouldRedact = !isLocalLlmUrl(settings.baseUrl);
  const prepared = shouldRedact ? redactForCloud(raw) : { text: raw, redacted: false };
  const text = await invokeProvider(settings, key, systemPrompt(request.action), prepared.text);
  return {
    text,
    redacted: prepared.redacted,
    provider: settings.provider,
    model: settings.model,
    draft: request.action === "draft" ? parseDraft(text) : undefined,
  };
}

async function invokeProvider(
  settings: LlmSettings,
  key: string | null,
  system: string,
  user: string,
): Promise<string> {
  if (settings.provider === "anthropic") {
    return anthropicChat(settings, key, system, user);
  }
  if (settings.provider === "gemini") {
    return geminiChat(settings, key, system, user);
  }
  return openAiChat(settings, key, system, user);
}

async function openAiChat(
  settings: LlmSettings,
  key: string | null,
  system: string,
  user: string,
): Promise<string> {
  const url = `${settings.baseUrl}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || `LLM request failed (${res.status})`);
  }
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("The model returned an empty response.");
  }
  return content;
}

async function anthropicChat(
  settings: LlmSettings,
  key: string | null,
  system: string,
  user: string,
): Promise<string> {
  if (!key) {
    throw new Error("An Anthropic API key is required.");
  }
  const res = await fetch(`${settings.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const body = (await res.json()) as {
    error?: { message?: string };
    content?: Array<{ text?: string }>;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || `Anthropic request failed (${res.status})`);
  }
  const content = body.content?.map((part) => part.text ?? "").join("").trim();
  if (!content) {
    throw new Error("The model returned an empty response.");
  }
  return content;
}

async function geminiChat(
  settings: LlmSettings,
  key: string | null,
  system: string,
  user: string,
): Promise<string> {
  if (!key) {
    throw new Error("A Gemini API key is required.");
  }
  const url = `${settings.baseUrl}/models/${encodeURIComponent(settings.model)}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });
  const body = (await res.json()) as {
    error?: { message?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  if (!res.ok) {
    throw new Error(body.error?.message || `Gemini request failed (${res.status})`);
  }
  const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!content) {
    throw new Error("The model returned an empty response.");
  }
  return content;
}

function parseDraft(text: string): RepeaterSendRequest | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? "").trim() || extractJsonObject(text);
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as {
      method?: string;
      url?: string;
      headers?: HeaderPair[] | Record<string, string>;
      body?: string;
    };
    if (!parsed.url || !parsed.method) {
      return undefined;
    }
    let headers: HeaderPair[] = [];
    if (Array.isArray(parsed.headers)) {
      headers = parsed.headers.filter((item) => item && item.name);
    } else if (parsed.headers && typeof parsed.headers === "object") {
      headers = Object.entries(parsed.headers).map(([name, value]) => ({ name, value: String(value) }));
    }
    return {
      method: parsed.method,
      url: parsed.url,
      headers,
      body: parsed.body,
    };
  } catch {
    return undefined;
  }
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  return text.slice(start, end + 1);
}
