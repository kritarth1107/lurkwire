import type {
  FlowDetail,
  FlowList,
  FlowQuery,
  Project,
  RepeaterSendRequest,
} from "../shared/types";
import type { ProxyReady } from "./proxy";

export class ControlClient {
  constructor(private ready: () => ProxyReady | null) {}

  async health(): Promise<boolean> {
    try {
      const res = await this.request("GET", "/health");
      return res.ok;
    } catch {
      return false;
    }
  }

  listProjects(): Promise<Project[]> {
    return this.json("GET", "/projects");
  }

  createProject(name: string): Promise<Project> {
    return this.json("POST", "/projects", { name });
  }

  listFlows(query: FlowQuery): Promise<FlowList> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      params.set(key, String(value));
    }
    const qs = params.toString();
    return this.json("GET", qs ? `/flows?${qs}` : "/flows");
  }

  getFlow(id: string): Promise<FlowDetail> {
    return this.json("GET", `/flows/${encodeURIComponent(id)}`);
  }

  getFlowBody(id: string, which: "req" | "resp"): Promise<ArrayBuffer> {
    return this.buffer("GET", `/flows/${encodeURIComponent(id)}/body/${which}`);
  }

  sendRepeater(req: RepeaterSendRequest): Promise<FlowDetail> {
    return this.json("POST", "/repeater/send", req);
  }

  private url(path: string): string {
    const ready = this.ready();
    if (!ready) {
      throw new Error("proxy is not ready");
    }
    return `http://${ready.control_listen}${path}`;
  }

  private headers(init?: HeadersInit): Headers {
    const ready = this.ready();
    if (!ready) {
      throw new Error("proxy is not ready");
    }
    const headers = new Headers(init);
    headers.set("Authorization", `Bearer ${ready.auth_token}`);
    return headers;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers = this.headers(
      body === undefined ? undefined : { "Content-Type": "application/json" },
    );
    const res = await fetch(this.url(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res;
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.request(method, path, body);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`control ${method} ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  private async buffer(method: string, path: string): Promise<ArrayBuffer> {
    const res = await this.request(method, path);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`control ${method} ${path} failed: ${res.status} ${text}`);
    }
    return res.arrayBuffer();
  }
}
