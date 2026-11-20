import { newId } from "./id";
import type { MatchRule } from "./matchReplace";

export const MATCH_TEMPLATES: { id: string; name: string; rules: Omit<MatchRule, "id">[] }[] = [
  {
    id: "strip-auth",
    name: "Strip auth headers",
    rules: [
      { enabled: true, name: "Drop Authorization", match: "^Authorization:.*$", replace: "", regex: true, where: "headers" },
      { enabled: true, name: "Drop Cookie", match: "^Cookie:.*$", replace: "", regex: true, where: "headers" },
    ],
  },
  {
    id: "localhost",
    name: "Rewrite host to localhost",
    rules: [
      { enabled: true, name: "Host to 127.0.0.1", match: "https?://[^/]+", replace: "http://127.0.0.1:8080", regex: true, where: "url" },
    ],
  },
  {
    id: "http-downgrade",
    name: "Force HTTP",
    rules: [{ enabled: true, name: "https → http", match: "https://", replace: "http://", regex: false, where: "url" }],
  },
  {
    id: "cors-origin",
    name: "Set Origin to evil.example",
    rules: [
      { enabled: true, name: "Origin", match: "^Origin:.*$", replace: "Origin: https://evil.example", regex: true, where: "headers" },
    ],
  },
];

export function rulesFromTemplate(id: string): MatchRule[] {
  const pack = MATCH_TEMPLATES.find((item) => item.id === id);
  if (!pack) {
    return [];
  }
  return pack.rules.map((rule) => ({ ...rule, id: newId() }));
}
