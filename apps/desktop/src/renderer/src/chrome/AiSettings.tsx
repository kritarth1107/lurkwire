import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, LlmAction, LlmProvider, LlmSettings } from "../../../shared/types";
import {
  LLM_PROVIDERS,
  providerInfo,
  setDefaultProvider,
  upsertConnector,
} from "../../../shared/llm";

const TASKS: { id: LlmAction; label: string }[] = [
  { id: "explain", label: "Explain" },
  { id: "suggest", label: "Suggest tests" },
  { id: "draft", label: "Draft into Repeater" },
];

export function AiSettings({ state }: { state: AppSnapshot }) {
  const llm = state.prefs.llm;
  const [keys, setKeys] = useState<LlmProvider[]>([]);
  const [expanded, setExpanded] = useState<LlmProvider>(llm.provider);

  useEffect(() => {
    void window.lurkwire.listLlmKeys().then(setKeys);
  }, []);

  function save(next: LlmSettings) {
    void window.lurkwire.setPrefs({ llm: next });
  }

  return (
    <section className="ai-settings">
      <h3>AI connectors</h3>
      <p>
        Connect OpenAI, Anthropic, Gemini, xAI Grok, OpenRouter, Ollama, LM Studio, or any
        OpenAI-compatible endpoint. Keys stay in the OS secret store. Cloud calls are redacted;
        a human always sends.
      </p>
      <div className="settings-row">
        <div>
          <strong>Default connector</strong>
          <p>Used when a task has no specific route.</p>
        </div>
        <select
          value={llm.provider}
          onChange={(event) => save(setDefaultProvider(llm, event.target.value as LlmProvider))}
        >
          {LLM_PROVIDERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <div>
          <strong>Local-only mode</strong>
          <p>Refuse any endpoint that is not on loopback.</p>
        </div>
        <input
          type="checkbox"
          checked={llm.localOnly}
          onChange={(event) => save({ ...llm, localOnly: event.target.checked })}
        />
      </div>
      <h4>Per-task routing</h4>
      <p className="muted">Send each AI action to a specific connector, or keep the default.</p>
      {TASKS.map((task) => (
        <div className="settings-row" key={task.id}>
          <div>
            <strong>{task.label}</strong>
          </div>
          <select
            value={llm.routing[task.id] ?? "default"}
            onChange={(event) =>
              save({
                ...llm,
                routing: { ...llm.routing, [task.id]: event.target.value as LlmProvider | "default" },
              })
            }
          >
            <option value="default">Default ({providerInfo(llm.provider).label})</option>
            {LLM_PROVIDERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      <h4>Connectors</h4>
      {LLM_PROVIDERS.map((item) => (
        <ConnectorCard
          key={item.id}
          provider={item.id}
          llm={llm}
          hasKey={keys.includes(item.id)}
          expanded={expanded === item.id}
          onToggle={() => setExpanded((prev) => (prev === item.id ? llm.provider : item.id))}
          onSave={save}
          onKeysChange={setKeys}
        />
      ))}
    </section>
  );
}

function ConnectorCard({
  provider,
  llm,
  hasKey,
  expanded,
  onToggle,
  onSave,
  onKeysChange,
}: {
  provider: LlmProvider;
  llm: LlmSettings;
  hasKey: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (next: LlmSettings) => void;
  onKeysChange: (ids: LlmProvider[]) => void;
}) {
  const info = providerInfo(provider);
  const conn = llm.connectors[provider];
  const baseUrl = conn?.baseUrl ?? (llm.provider === provider ? llm.baseUrl : info.baseUrl);
  const model = conn?.model ?? (llm.provider === provider ? llm.model : info.model);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<"models" | "test" | "key" | null>(null);

  const shownModels = useMemo(() => {
    if (model && !models.includes(model)) {
      return [model, ...models];
    }
    return models;
  }, [model, models]);

  return (
    <div className={`connector-card${llm.provider === provider ? " default" : ""}`}>
      <button type="button" className="connector-head" onClick={onToggle}>
        <span>
          <strong>{info.label}</strong>
          {llm.provider === provider ? <em> default</em> : null}
        </span>
        <span className="muted">
          {hasKey || !info.needsKey ? (info.needsKey ? "Key saved" : "No key required") : "No key"}
          {model ? ` · ${model}` : ""}
        </span>
      </button>
      {expanded ? (
        <div className="connector-body">
          <label>
            Base URL
            <input
              type="text"
              value={baseUrl}
              placeholder={info.baseUrl || "https://api.example.com/v1"}
              onChange={(event) => onSave(upsertConnector(llm, provider, { baseUrl: event.target.value }))}
            />
          </label>
          <label>
            Model
            <div className="model-row">
              {shownModels.length > 1 || models.length > 0 ? (
                <select
                  value={model}
                  onChange={(event) => onSave(upsertConnector(llm, provider, { model: event.target.value }))}
                >
                  {shownModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                type="text"
                value={model}
                placeholder={info.model || "model-id"}
                onChange={(event) => onSave(upsertConnector(llm, provider, { model: event.target.value }))}
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  setBusy("models");
                  setStatus(null);
                  void window.lurkwire
                    .listLlmModels(provider)
                    .then((list) => {
                      setModels(list);
                      setStatus(list.length ? `Found ${list.length} models.` : "No models returned.");
                    })
                    .catch((err: unknown) => setStatus(err instanceof Error ? err.message : String(err)))
                    .finally(() => setBusy(null));
                }}
              >
                {busy === "models" ? "Listing…" : "List models"}
              </button>
            </div>
          </label>
          {info.needsKey || provider === "openai-compatible" || provider === "ollama" ? (
            <label>
              API key
              <div className="model-row">
                <input
                  type="password"
                  value={key}
                  placeholder={hasKey ? "Key stored — paste to replace" : "Paste a key, then save"}
                  onChange={(event) => setKey(event.target.value)}
                />
                <button
                  type="button"
                  className="primary"
                  disabled={busy !== null || !key.trim()}
                  onClick={() => {
                    setBusy("key");
                    void window.lurkwire
                      .setLlmKey(key, provider)
                      .then((saved) => {
                        if (saved) {
                          onKeysChange(Array.from(new Set([...[], provider])));
                          void window.lurkwire.listLlmKeys().then(onKeysChange);
                          setKey("");
                          setStatus("Key saved in the OS secret store.");
                        }
                      })
                      .catch((err: unknown) => setStatus(err instanceof Error ? err.message : String(err)))
                      .finally(() => setBusy(null));
                  }}
                >
                  Save key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void window.lurkwire.clearLlmKey(provider).then(() => {
                      void window.lurkwire.listLlmKeys().then(onKeysChange);
                      setStatus("Key removed.");
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            </label>
          ) : (
            <p className="muted">This local connector does not require an API key.</p>
          )}
          <div className="model-row">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setBusy("test");
                void window.lurkwire
                  .testLlmConnection(provider)
                  .then((result) => {
                    setModels((prev) => (result.models.length ? result.models : prev));
                    setStatus(result.message);
                  })
                  .catch((err: unknown) => setStatus(err instanceof Error ? err.message : String(err)))
                  .finally(() => setBusy(null));
              }}
            >
              {busy === "test" ? "Testing…" : "Test connection"}
            </button>
            {llm.provider !== provider ? (
              <button type="button" onClick={() => onSave(setDefaultProvider(llm, provider))}>
                Make default
              </button>
            ) : null}
          </div>
          {status ? <p className={status.toLowerCase().includes("fail") || status.toLowerCase().includes("error") ? "banner" : "muted"}>{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
