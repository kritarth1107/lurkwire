import type { HeaderPair } from "./types";

export const CORS_PROBE_ORIGIN = "https://lurkwire.example";

export type CorsAnalysis = {
  allowOrigin: string | null;
  allowCredentials: boolean;
  allowMethods: string | null;
  allowHeaders: string | null;
  reflectsOrigin: boolean;
  wildcard: boolean;
  credentialedWildcard: boolean;
  summary: string;
};

function headerValue(headers: HeaderPair[], name: string): string | null {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.toLowerCase() === lower)?.value ?? null;
}

export function corsProbeHeaders(method: string): HeaderPair[] {
  return [
    { name: "Origin", value: CORS_PROBE_ORIGIN },
    { name: "Access-Control-Request-Method", value: method || "GET" },
    { name: "Access-Control-Request-Headers", value: "content-type, authorization" },
  ];
}

export function analyzeCors(headers: HeaderPair[], origin = CORS_PROBE_ORIGIN): CorsAnalysis {
  const allowOrigin = headerValue(headers, "access-control-allow-origin");
  const allowCredentials = (headerValue(headers, "access-control-allow-credentials") ?? "").toLowerCase() === "true";
  const allowMethods = headerValue(headers, "access-control-allow-methods");
  const allowHeaders = headerValue(headers, "access-control-allow-headers");
  const wildcard = allowOrigin === "*";
  const reflectsOrigin = allowOrigin === origin;
  const credentialedWildcard = wildcard && allowCredentials;
  let summary: string;
  if (!allowOrigin) {
    summary = "No Access-Control-Allow-Origin header. A cross-origin browser request from this probe origin would be blocked.";
  } else if (credentialedWildcard) {
    summary = "The response allows any origin (*) and credentials. Browsers should reject this combination, but it is still a messy policy.";
  } else if (reflectsOrigin && allowCredentials) {
    summary = `The response reflects ${origin} and allows credentials. A cross-origin request from that origin could read the response with cookies.`;
  } else if (reflectsOrigin) {
    summary = `The response reflects the probe origin ${origin}.`;
  } else if (wildcard) {
    summary = "The response allows any origin (*) without credentials.";
  } else {
    summary = `Access-Control-Allow-Origin is ${allowOrigin}.`;
  }
  return {
    allowOrigin,
    allowCredentials,
    allowMethods,
    allowHeaders,
    reflectsOrigin,
    wildcard,
    credentialedWildcard,
    summary,
  };
}
