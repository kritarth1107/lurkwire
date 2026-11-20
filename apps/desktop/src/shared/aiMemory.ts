export type AiMemoryEntry = {
  id: string;
  action: string;
  ts: number;
  input: string;
  output: string;
  model: string;
  provider: string;
};

export type AiMemoryStore = Record<string, AiMemoryEntry[]>;

export const MEMORY_PER_TASK = 8;
export const MEMORY_INPUT_CHARS = 2000;
export const MEMORY_OUTPUT_CHARS = 4000;

export function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max)}…`;
}

export function formatMemoryPrompt(entries: AiMemoryEntry[]): string {
  if (!entries.length) {
    return "";
  }
  const recent = entries.slice(-5);
  const blocks = recent.map((entry, index) => {
    return `Memory ${index + 1} (${new Date(entry.ts).toISOString()}):
User: ${entry.input}
Assistant: ${entry.output}`;
  });
  return `You have local notes from earlier turns of this same task. Use them when they help, and ignore them when they do not.\n\n${blocks.join("\n\n")}`;
}
