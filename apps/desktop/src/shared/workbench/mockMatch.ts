import type { WbRequest } from "./types";

export type IncomingMock = {
  method: string;
  pathname: string;
};

function pathOf(url: string): string {
  const stripped = url.replace(/^\s*\{\{[^}]+\}\}/, "");
  if (!stripped) {
    return "/";
  }
  if (stripped.startsWith("http://") || stripped.startsWith("https://")) {
    try {
      return new URL(stripped).pathname || "/";
    } catch {
      return "/";
    }
  }
  const path = stripped.split("?")[0] ?? "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function pathToRegex(url: string): RegExp {
  const path = pathOf(url);
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{\\\{[^}]+\\\}\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}/?$`, "i");
}

export function matchMockRequest(incoming: IncomingMock, requests: WbRequest[]): WbRequest | null {
  const method = incoming.method.toUpperCase();
  const exact = requests.find((item) => (item.protocol ?? "http") === "http" && item.method.toUpperCase() === method && pathOf(item.url) === incoming.pathname);
  if (exact) {
    return exact;
  }
  return (
    requests.find((item) => {
      if ((item.protocol ?? "http") !== "http") {
        return false;
      }
      if (item.method.toUpperCase() !== method) {
        return false;
      }
      return pathToRegex(item.url).test(incoming.pathname);
    }) ?? null
  );
}

export type MockReply = {
  status: number;
  headers: { name: string; value: string }[];
  body: string;
};

export function mockReplyFor(request: WbRequest, fallbackName: string): MockReply {
  if (request.mock) {
    return {
      status: request.mock.status || 200,
      headers: request.mock.headers ?? [],
      body: request.mock.body ?? "",
    };
  }
  return {
    status: 200,
    headers: [{ name: "Content-Type", value: "application/json" }],
    body: JSON.stringify({ mock: true, name: request.name || fallbackName, method: request.method, url: request.url }, null, 2),
  };
}
