export type LlmProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "xai"
  | "openrouter"
  | "ollama"
  | "lmstudio"
  | "openai-compatible";

export type LlmAction = "explain" | "suggest" | "draft" | "payloads" | "summarize" | "poc" | "chat";

export type LlmConnectorConfig = {
  baseUrl: string;
  model: string;
};

export type LlmSettings = {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  localOnly: boolean;
  connectors: Partial<Record<LlmProvider, LlmConnectorConfig>>;
  routing: Partial<Record<LlmAction, LlmProvider | "default">>;
};

export type LlmProviderInfo = {
  id: LlmProvider;
  label: string;
  baseUrl: string;
  model: string;
  kind: "openai" | "anthropic" | "gemini";
  needsKey: boolean;
  local: boolean;
};

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    kind: "openai",
    needsKey: true,
    local: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-20250514",
    kind: "anthropic",
    needsKey: true,
    local: false,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.0-flash",
    kind: "gemini",
    needsKey: true,
    local: false,
  },
  {
    id: "xai",
    label: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-3-mini",
    kind: "openai",
    needsKey: true,
    local: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    kind: "openai",
    needsKey: true,
    local: false,
  },
  {
    id: "ollama",
    label: "Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    kind: "openai",
    needsKey: false,
    local: true,
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    kind: "openai",
    needsKey: false,
    local: true,
  },
  {
    id: "openai-compatible",
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    model: "",
    kind: "openai",
    needsKey: true,
    local: false,
  },
];

export const LLM_PROVIDER_IDS = LLM_PROVIDERS.map((item) => item.id);

export const DEFAULT_LLM: LlmSettings = {
  provider: "ollama",
  baseUrl: "http://127.0.0.1:11434/v1",
  model: "llama3.2",
  localOnly: true,
  connectors: {},
  routing: {},
};

export function providerInfo(id: LlmProvider): LlmProviderInfo {
  return LLM_PROVIDERS.find((item) => item.id === id) ?? LLM_PROVIDERS[5];
}

export function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDER_IDS as string[]).includes(value);
}

export function resolveLlmForTask(settings: LlmSettings, action: LlmAction): {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
  localOnly: boolean;
} {
  const routed = settings.routing?.[action];
  const provider = !routed || routed === "default" ? settings.provider : routed;
  const info = providerInfo(provider);
  const conn = settings.connectors?.[provider];
  const useTop = provider === settings.provider;
  const baseUrl = (conn?.baseUrl || (useTop ? settings.baseUrl : "") || info.baseUrl).replace(/\/+$/, "");
  const model = conn?.model || (useTop ? settings.model : "") || info.model;
  return { provider, baseUrl, model, localOnly: settings.localOnly };
}

export function upsertConnector(
  settings: LlmSettings,
  provider: LlmProvider,
  patch: Partial<LlmConnectorConfig>,
): LlmSettings {
  const info = providerInfo(provider);
  const current = settings.connectors[provider] ?? {
    baseUrl: provider === settings.provider ? settings.baseUrl : info.baseUrl,
    model: provider === settings.provider ? settings.model : info.model,
  };
  const next = { ...current, ...patch };
  const connectors = { ...settings.connectors, [provider]: next };
  if (provider === settings.provider) {
    return { ...settings, connectors, baseUrl: next.baseUrl, model: next.model };
  }
  return { ...settings, connectors };
}

export function setDefaultProvider(settings: LlmSettings, provider: LlmProvider): LlmSettings {
  const info = providerInfo(provider);
  const conn = settings.connectors[provider];
  return {
    ...settings,
    provider,
    baseUrl: conn?.baseUrl || (provider === settings.provider ? settings.baseUrl : info.baseUrl),
    model: conn?.model || (provider === settings.provider ? settings.model : info.model),
  };
}

export function parseModelList(provider: LlmProvider, body: unknown): string[] {
  const info = providerInfo(provider);
  const rec = (body ?? {}) as Record<string, unknown>;
  const names = new Set<string>();
  const data = rec.data;
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === "object" && "id" in item && typeof (item as { id: unknown }).id === "string") {
        names.add((item as { id: string }).id);
      }
    }
  }
  const models = rec.models;
  if (Array.isArray(models)) {
    for (const item of models) {
      if (typeof item === "string") {
        names.add(item);
        continue;
      }
      if (item && typeof item === "object") {
        const recItem = item as { id?: unknown; name?: unknown };
        const raw = typeof recItem.id === "string" ? recItem.id : typeof recItem.name === "string" ? recItem.name : "";
        if (raw) {
          names.add(info.kind === "gemini" ? raw.replace(/^models\//, "") : raw);
        }
      }
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function modelsUrl(provider: LlmProvider, baseUrl: string): string {
  const info = providerInfo(provider);
  const base = baseUrl.replace(/\/+$/, "");
  if (info.kind === "anthropic") {
    return `${base}/v1/models`;
  }
  if (info.kind === "gemini") {
    return `${base}/models`;
  }
  return `${base}/models`;
}

export function ollamaTagsUrl(baseUrl: string): string | null {
  try {
    const url = new URL(baseUrl);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      return null;
    }
    return `${url.protocol}//${url.host}/api/tags`;
  } catch {
    return null;
  }
}
