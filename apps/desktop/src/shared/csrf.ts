import type { HeaderPair } from "./types";

export type CsrfInput = {
  method: string;
  url: string;
  headers?: HeaderPair[];
  body?: string;
};

function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contentType(headers: HeaderPair[] | undefined): string {
  return (headers ?? []).find((item) => item.name.toLowerCase() === "content-type")?.value.toLowerCase() ?? "";
}

function parseUrlEncoded(body: string): Array<[string, string]> {
  if (!body) {
    return [];
  }
  return body.split("&").filter(Boolean).map((part) => {
    const idx = part.indexOf("=");
    const key = idx === -1 ? part : part.slice(0, idx);
    const value = idx === -1 ? "" : part.slice(idx + 1);
    try {
      return [decodeURIComponent(key.replace(/\+/g, " ")), decodeURIComponent(value.replace(/\+/g, " "))] as [string, string];
    } catch {
      return [key, value] as [string, string];
    }
  });
}

/**
 * Build a reviewable HTML CSRF proof-of-concept. The human saves and opens it;
 * Lurkwire never auto-submits against a live target.
 */
export function buildCsrfPoc(input: CsrfInput): { html: string; mode: "form" | "fetch"; notes: string[] } {
  const method = (input.method || "GET").toUpperCase();
  const url = input.url;
  const mime = contentType(input.headers);
  const notes: string[] = [
    "Review this in a local file or a lab origin you control. Do not host it against a target you do not have permission to test.",
  ];

  const isFormish =
    method === "GET" ||
    method === "POST" && (mime.includes("application/x-www-form-urlencoded") || mime.includes("multipart/form-data") || !mime);
  const canForm = method === "GET" || method === "POST";

  if (canForm && isFormish) {
    const fields = method === "GET" ? [] : parseUrlEncoded(input.body ?? "");
    if (method === "GET" && url.includes("?")) {
      notes.push("Query string parameters are in the form action URL.");
    }
    const enctype = mime.includes("multipart/form-data")
        ? "multipart/form-data"
        : "application/x-www-form-urlencoded";
      const inputs = fields
        .map(([key, value]) => `    <input type="hidden" name="${attr(key)}" value="${attr(value)}" />`)
        .join("\n");
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CSRF PoC</title>
</head>
<body>
  <h1>CSRF PoC</h1>
  <p>This form is a proof of concept. Submit it only in a lab you are authorized to test.</p>
  <form id="csrf" action="${attr(url)}" method="${attr(method)}" enctype="${enctype}">
${inputs || "    <!-- no body fields -->"}
    <button type="submit">Submit request</button>
  </form>
  <script>
    // Auto-submit stays disabled so a human always reviews first.
  </script>
</body>
</html>
`;
    return { html, mode: "form", notes };
  }

  notes.push("This request is not a simple HTML form (JSON or an uncommon method). The PoC uses fetch, which browsers will only send cross-origin if CORS allows it. That makes this more of a CORS/CSRF hybrid check.");
  const headerObj: Record<string, string> = {};
  for (const header of input.headers ?? []) {
    const name = header.name.toLowerCase();
    if (name === "cookie" || name === "authorization" || name === "host" || name === "content-length") {
      continue;
    }
    headerObj[header.name] = header.value;
  }
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CSRF / CORS PoC</title>
</head>
<body>
  <h1>CSRF / CORS PoC</h1>
  <p>This uses <code>fetch</code> with <code>credentials: "include"</code>. It will only succeed cross-origin if the target CORS policy allows your origin. Review before running.</p>
  <button id="go" type="button">Send request</button>
  <pre id="out"></pre>
  <script>
    document.getElementById("go").addEventListener("click", async () => {
      const out = document.getElementById("out");
      try {
        const response = await fetch(${JSON.stringify(url)}, {
          method: ${JSON.stringify(method)},
          credentials: "include",
          mode: "cors",
          headers: ${JSON.stringify(headerObj, null, 2)},
          ${input.body ? `body: ${JSON.stringify(input.body)},` : ""}
        });
        out.textContent = response.status + "\\n" + await response.text();
      } catch (error) {
        out.textContent = String(error);
      }
    });
  </script>
</body>
</html>
`;
  return { html, mode: "fetch", notes };
}
