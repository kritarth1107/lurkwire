import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import type {
  FlowDetail,
  HeaderPair,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmSettings,
  RepeaterSendRequest,
} from "../shared/types";
import { modelsUrl, ollamaTagsUrl, parseModelList, providerInfo, resolveLlmForTask } from "../shared/llm";
import { isLocalLlmUrl, redactForCloud } from "../shared/redact";
import { appendAiMemory, memoryPromptFor } from "./aiMemory";

function keysDir(): string {
  return join(app.getPath("userData"), "llm-keys");
}

function keyPath(provider: LlmProvider): string {
  return join(keysDir(), `${provider}.bin`);
}

function legacyKeyPath(): string {
  return join(app.getPath("userData"), "llm-key.bin");
}

export function hasLlmKey(provider?: LlmProvider): boolean {
  if (provider) {
    return existsSync(keyPath(provider)) || existsSync(legacyKeyPath());
  }
  return existsSync(legacyKeyPath()) || (existsSync(keysDir()) && listLlmKeyProviders().length > 0);
}

export function listLlmKeyProviders(): LlmProvider[] {
  const found = new Set<LlmProvider>();
  if (existsSync(keysDir())) {
    for (const file of ["openai", "anthropic", "gemini", "xai", "openrouter", "ollama", "lmstudio", "openai-compatible"] as LlmProvider[]) {
      if (existsSync(keyPath(file))) {
        found.add(file);
      }
    }
  }
  return [...found];
}

export function saveLlmKey(secret: string, provider: LlmProvider = "openai"): void {
  const trimmed = secret.trim();
  if (!trimmed) {
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS key encryption is unavailable, so the API key was not saved.");
  }
  mkdirSync(keysDir(), { recursive: true });
  writeFileSync(keyPath(provider), safeStorage.encryptString(trimmed));
}

export function clearLlmKey(provider?: LlmProvider): void {
  if (provider) {
    if (existsSync(keyPath(provider))) {
      unlinkSync(keyPath(provider));
    }
    return;
  }
  if (existsSync(legacyKeyPath())) {
    unlinkSync(legacyKeyPath());
  }
  for (const id of listLlmKeyProviders()) {
    unlinkSync(keyPath(id));
  }
}

function loadLlmKey(provider: LlmProvider): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  const paths = [keyPath(provider), legacyKeyPath()];
  for (const file of paths) {
    if (!existsSync(file)) {
      continue;
    }
    try {
      return safeStorage.decryptString(readFileSync(file));
    } catch {
      continue;
    }
  }
  return null;
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
  if (action === "payloads") {
    return `${common} Generate high-quality payloads for the selected parameter or request. Group by vulnerability class (SQLi, XSS, SSTI, SSRF, path traversal, auth bypass). Include a one-line note on when each is useful. Do not wrap the whole answer in JSON unless asked.`;
  }
  if (action === "summarize") {
    return `${common} Summarize the traffic the human provided: endpoints, auth, interesting parameters, cookies, and the two or three most likely issues worth testing next.`;
  }
  if (action === "poc") {
    return `${common} Draft a clear proof-of-concept a pentester can paste into a report or Repeater. Include preconditions, the exact request, expected vs actual behavior, and impact. If you propose an HTTP request, also include a JSON object in a fenced block with keys method, url, headers (array of {name,value}), and body (string).`;
  }
  if (action === "chat") {
    return `${common} Answer the human's question about the current page, request, or engagement. Prefer actionable pentest guidance over general theory.`;
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
  const settings = resolveLlmForTask(settingsInput, request.action);
  if (settings.localOnly && !isLocalLlmUrl(settings.baseUrl)) {
    throw new Error("Local-only mode is on. Set a loopback endpoint such as Ollama, or turn local-only off.");
  }
  const info = providerInfo(settings.provider);
  const key = loadLlmKey(settings.provider);
  if (info.needsKey && !key) {
    throw new Error(`Add a ${info.label} API key in Settings before using this model.`);
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
  let user = prepared.text;
  let memoryRedacted = false;
  const memory = memoryPromptFor(request.action);
  if (memory) {
    const preparedMem = shouldRedact ? redactForCloud(memory) : { text: memory, redacted: false };
    memoryRedacted = preparedMem.redacted;
    user = `${preparedMem.text}\n\n---\n\n${prepared.text}`;
  }
  const text = await invokeProvider(settings, key, systemPrompt(request.action), user);
  appendAiMemory({
    action: request.action,
    input: prepared.text,
    output: text,
    model: settings.model,
    provider: settings.provider,
  });
  return {
    text,
    redacted: prepared.redacted || memoryRedacted,
    provider: settings.provider,
    model: settings.model,
    draft: request.action === "draft" || request.action === "poc" ? parseDraft(text) : undefined,
  };
}

type LlmClient = { provider: LlmProvider; baseUrl: string; model: string };

async function invokeProvider(
  settings: LlmClient,
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
  settings: LlmClient,
  key: string | null,
  system: string,
  user: string,
): Promise<string> {
  const url = `${settings.baseUrl}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://lurkwire.com";
    headers["X-Title"] = "Lurkwire";
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
  settings: LlmClient,
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
  settings: LlmClient,
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

export type LlmProbeResult = {
  ok: boolean;
  message: string;
  models: string[];
};

async function fetchJson(url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(12_000) });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

function authHeaders(provider: LlmProvider, key: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const info = providerInfo(provider);
  if (info.kind === "anthropic" && key) {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (info.kind === "gemini" && key) {
    // key is passed as a query param
  } else if (key) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://lurkwire.com";
    headers["X-Title"] = "Lurkwire";
  }
  return headers;
}

export async function listLlmModels(settingsInput: LlmSettings, provider: LlmProvider): Promise<string[]> {
  const baseUrl = (settingsInput.connectors?.[provider]?.baseUrl || (settingsInput.provider === provider ? settingsInput.baseUrl : "") || providerInfo(provider).baseUrl).replace(/\/+$/, "");
  if (settingsInput.localOnly && !isLocalLlmUrl(baseUrl)) {
    throw new Error("Local-only mode is on, so cloud model lists are blocked.");
  }
  const info = providerInfo(provider);
  const key = loadLlmKey(provider);
  if (info.needsKey && !key) {
    throw new Error(`Add a ${info.label} API key first.`);
  }
  if (!baseUrl) {
    throw new Error("Set a base URL for this connector first.");
  }
  let url = modelsUrl(provider, baseUrl);
  if (info.kind === "gemini" && key) {
    url += `${url.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`;
  }
  const first = await fetchJson(url, authHeaders(provider, key));
  let models = first.ok ? parseModelList(provider, first.body) : [];
  if (!models.length && provider === "ollama") {
    const tags = ollamaTagsUrl(baseUrl);
    if (tags) {
      const second = await fetchJson(tags, { Accept: "application/json" });
      if (second.ok) {
        models = parseModelList(provider, second.body);
      }
    }
  }
  if (!first.ok && models.length === 0) {
    const err = (first.body as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(err || `Listing models failed (${first.status})`);
  }
  return models;
}

export async function testLlmConnection(settingsInput: LlmSettings, provider: LlmProvider): Promise<LlmProbeResult> {
  try {
    const models = await listLlmModels(settingsInput, provider);
    const label = providerInfo(provider).label;
    if (models.length) {
      return { ok: true, message: `${label} responded with ${models.length} model${models.length === 1 ? "" : "s"}.`, models };
    }
    return { ok: true, message: `${label} is reachable, but the model list was empty.`, models };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), models: [] };
  }
}
