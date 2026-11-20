import { toCurl } from "./curl";
import { buildHttpRequest } from "./request";
import type { WbRequest } from "./types";

export const SNIPPET_LANGUAGES = [
  "curl",
  "fetch",
  "axios",
  "python",
  "go",
  "httpie",
] as const;

export type SnippetLanguage = (typeof SNIPPET_LANGUAGES)[number];

export const SNIPPET_LABELS: Record<SnippetLanguage, string> = {
  curl: "cURL",
  fetch: "JavaScript (fetch)",
  axios: "JavaScript (axios)",
  python: "Python (requests)",
  go: "Go (net/http)",
  httpie: "HTTPie",
};

function jsString(value: string): string {
  return JSON.stringify(value);
}

function headerMap(headers: { name: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers) {
    out[header.name] = header.value;
  }
  return out;
}

function looksJson(text: string): boolean {
  const trimmed = text.trim();
  return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
}

function indentJson(value: unknown, pad: string): string {
  return JSON.stringify(value, null, 2).split("\n").join(`\n${pad}`);
}

export function generateSnippet(
  language: SnippetLanguage,
  request: Pick<WbRequest, "method" | "url" | "params" | "headers" | "body" | "auth">,
): string {
  if (language === "curl") {
    return toCurl(request);
  }
  const built = buildHttpRequest(request);
  const headers = headerMap(built.headers);
  const method = built.method.toUpperCase();
  const hasBody = built.body != null && built.body !== "" && method !== "GET" && method !== "HEAD";

  if (language === "fetch") {
    const lines = [
      `const response = await fetch(${jsString(built.url)}, {`,
      `  method: ${jsString(built.method)},`,
    ];
    if (Object.keys(headers).length > 0) {
      lines.push(`  headers: ${indentJson(headers, "  ")},`);
    }
    if (hasBody) {
      lines.push(`  body: ${jsString(built.body ?? "")},`);
    }
    lines.push("});");
    lines.push("const data = await response.text();");
    lines.push("console.log(response.status, data);");
    return lines.join("\n");
  }

  if (language === "axios") {
    const lines = [
      'import axios from "axios";',
      "",
      "const response = await axios({",
      `  method: ${jsString(method.toLowerCase())},`,
      `  url: ${jsString(built.url)},`,
    ];
    if (Object.keys(headers).length > 0) {
      lines.push(`  headers: ${indentJson(headers, "  ")},`);
    }
    if (hasBody) {
      if (looksJson(built.body ?? "") && !built.bodyBase64) {
        lines.push(`  data: ${built.body},`);
      } else {
        lines.push(`  data: ${jsString(built.body ?? "")},`);
      }
    }
    lines.push("});");
    lines.push("console.log(response.status, response.data);");
    return lines.join("\n");
  }

  if (language === "python") {
    const lines = [
      "import requests",
      "",
      `url = ${jsString(built.url)}`,
      `headers = ${indentJson(headers, "")}`,
    ];
    if (hasBody && looksJson(built.body ?? "") && !built.bodyBase64) {
      lines.push(`payload = ${built.body}`);
      lines.push(`response = requests.request(${jsString(method)}, url, headers=headers, json=payload)`);
    } else if (hasBody) {
      lines.push(`data = ${jsString(built.body ?? "")}`);
      lines.push(`response = requests.request(${jsString(method)}, url, headers=headers, data=data)`);
    } else {
      lines.push(`response = requests.request(${jsString(method)}, url, headers=headers)`);
    }
    lines.push("print(response.status_code, response.text)");
    return lines.join("\n");
  }

  if (language === "go") {
    const lines = [
      "package main",
      "",
      `import (`,
      `	"fmt"`,
      `	"io"`,
      `	"net/http"`,
      `	"strings"`,
      ")",
      "",
      "func main() {",
    ];
    if (hasBody) {
      lines.push(`	body := strings.NewReader(${jsString(built.body ?? "")})`);
      lines.push(`	req, err := http.NewRequest(${jsString(method)}, ${jsString(built.url)}, body)`);
    } else {
      lines.push(`	req, err := http.NewRequest(${jsString(method)}, ${jsString(built.url)}, nil)`);
    }
    lines.push("	if err != nil {");
    lines.push("		panic(err)");
    lines.push("	}");
    for (const [name, value] of Object.entries(headers)) {
      lines.push(`	req.Header.Set(${jsString(name)}, ${jsString(value)})`);
    }
    lines.push("	resp, err := http.DefaultClient.Do(req)");
    lines.push("	if err != nil {");
    lines.push("		panic(err)");
    lines.push("	}");
    lines.push("	defer resp.Body.Close()");
    lines.push("	data, _ := io.ReadAll(resp.Body)");
    lines.push('	fmt.Println(resp.Status, string(data))');
    lines.push("}");
    return lines.join("\n");
  }

  // httpie
  const parts = ["http", method, built.url];
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "content-type") {
      continue;
    }
    parts.push(`${name}:${value}`);
  }
  if (hasBody && looksJson(built.body ?? "") && !built.bodyBase64) {
    return `${parts.join(" ")} <<< ${jsString(built.body ?? "")}`;
  }
  if (hasBody) {
    return `${parts.join(" ")} <<< ${jsString(built.body ?? "")}`;
  }
  return parts.join(" ");
}
