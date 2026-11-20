import { describe, expect, it } from "vitest";
import {
  DEFAULT_LLM,
  modelsUrl,
  parseModelList,
  resolveLlmForTask,
  setDefaultProvider,
  upsertConnector,
} from "./llm";

describe("llm routing", () => {
  it("uses the default connector when a task is unrouted", () => {
    const resolved = resolveLlmForTask(DEFAULT_LLM, "explain");
    expect(resolved.provider).toBe("ollama");
    expect(resolved.baseUrl).toContain("11434");
    expect(resolved.model).toBe("llama3.2");
  });

  it("routes a task to another connector's URL and model", () => {
    const settings = upsertConnector(
      { ...DEFAULT_LLM, routing: { draft: "openai" } },
      "openai",
      { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    );
    const draft = resolveLlmForTask(settings, "draft");
    const explain = resolveLlmForTask(settings, "explain");
    expect(draft.provider).toBe("openai");
    expect(draft.model).toBe("gpt-4o-mini");
    expect(explain.provider).toBe("ollama");
  });

  it("keeps top-level fields in sync with the default connector", () => {
    const next = setDefaultProvider(DEFAULT_LLM, "lmstudio");
    expect(next.provider).toBe("lmstudio");
    expect(next.baseUrl).toContain("1234");
  });
});

describe("model list parsing", () => {
  it("reads OpenAI, Ollama, and Gemini payloads", () => {
    expect(parseModelList("openai", { data: [{ id: "gpt-4o-mini" }, { id: "o3-mini" }] })).toEqual([
      "gpt-4o-mini",
      "o3-mini",
    ]);
    expect(parseModelList("ollama", { models: [{ name: "llama3.2:latest" }] })).toEqual(["llama3.2:latest"]);
    expect(parseModelList("gemini", { models: [{ name: "models/gemini-2.0-flash" }] })).toEqual([
      "gemini-2.0-flash",
    ]);
  });

  it("builds provider model URLs", () => {
    expect(modelsUrl("openai", "https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/models");
    expect(modelsUrl("anthropic", "https://api.anthropic.com")).toBe("https://api.anthropic.com/v1/models");
    expect(modelsUrl("gemini", "https://generativelanguage.googleapis.com/v1beta")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
  });
});
