import { parse } from "yaml";

export function parseYaml(input: string): unknown {
  return parse(input, { prettyErrors: true });
}

export function looksLikeYamlOpenApi(input: string): boolean {
  const head = input.trimStart().slice(0, 800).replace(/\r/g, "");
  const withoutComments = head
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#") && trimmed !== "---" && !trimmed.startsWith("%YAML");
    })
    .join("\n");
  return /^(?:openapi|swagger)\s*:/i.test(withoutComments);
}
