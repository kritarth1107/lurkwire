import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { loadWorkspace } from "./store";
import { matchMockRequest, mockReplyFor } from "../../shared/workbench/mockMatch";

export type MockStatus = {
  running: boolean;
  url: string | null;
  collectionId: string | null;
};

let server: Server | null = null;
let listenUrl: string | null = null;
let collectionId: string | null = null;

function reply(res: ServerResponse, status: number, headers: Record<string, string>, body: string): void {
  res.writeHead(status, headers);
  res.end(body);
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  if (url.pathname === "/__lurkwire/health") {
    reply(res, 200, { "content-type": "application/json" }, JSON.stringify({ ok: true, collectionId }));
    return;
  }
  const workspace = loadWorkspace();
  const requests = workspace.requests.filter((item) => !collectionId || item.collectionId === collectionId);
  const hit = matchMockRequest({ method: req.method ?? "GET", pathname: url.pathname }, requests);
  if (!hit) {
    reply(
      res,
      404,
      { "content-type": "application/json" },
      JSON.stringify({ error: "No Workbench request matches this path", method: req.method, path: url.pathname }),
    );
    return;
  }
  const payload = mockReplyFor(hit, hit.name);
  const headers: Record<string, string> = { "x-lurkwire-mock": hit.id };
  for (const header of payload.headers) {
    headers[header.name] = header.value;
  }
  if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json; charset=utf-8";
  }
  reply(res, payload.status, headers, payload.body);
}

export function mockStatus(): MockStatus {
  return { running: Boolean(server?.listening), url: listenUrl, collectionId };
}

export async function startMock(nextCollectionId: string): Promise<MockStatus> {
  await stopMock();
  const workspace = loadWorkspace();
  if (!workspace.collections.some((item) => item.id === nextCollectionId)) {
    throw new Error("Choose a collection to mock first.");
  }
  collectionId = nextCollectionId;
  server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock server failed to bind a local port.");
  }
  listenUrl = `http://127.0.0.1:${address.port}`;
  return mockStatus();
}

export async function stopMock(): Promise<MockStatus> {
  const current = server;
  server = null;
  listenUrl = null;
  collectionId = null;
  if (current) {
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }
  return mockStatus();
}
