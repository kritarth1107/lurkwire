import type {
  AuditEntry,
  FlowDetail,
  FlowList,
  FlowQuery,
  ForwardEdit,
  InterceptConfig,
  InterceptState,
  KillState,
  NewScopeRule,
  PausedItem,
  Project,
  Finding,
  FindingList,
  FindingQuery,
  FlowAnnotation,
  IntruderJob,
  IntruderStart,
  RepeaterSendRequest,
  ScopeRule,
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

  patchFlow(id: string, patch: FlowAnnotation): Promise<FlowDetail> {
    return this.json("PATCH", `/flows/${encodeURIComponent(id)}`, patch);
  }


  getFlowBody(id: string, which: "req" | "resp"): Promise<ArrayBuffer> {
    return this.buffer("GET", `/flows/${encodeURIComponent(id)}/body/${which}`);
  }

  sendRepeater(req: RepeaterSendRequest): Promise<FlowDetail> {
    return this.json("POST", "/repeater/send", req);
  }

  sendWorkbench(req: RepeaterSendRequest): Promise<FlowDetail> {
    return this.json("POST", "/workbench/send", req);
  }

  getIntercept(): Promise<InterceptState> {
    return this.json("GET", "/intercept");
  }

  setIntercept(config: InterceptConfig): Promise<InterceptState> {
    return this.json("PUT", "/intercept", config);
  }

  listInterceptQueue(): Promise<PausedItem[]> {
    return this.json("GET", "/intercept/queue");
  }

  forwardIntercept(id: string, edit: ForwardEdit): Promise<void> {
    return this.json("POST", `/intercept/queue/${encodeURIComponent(id)}/forward`, edit);
  }

  dropIntercept(id: string): Promise<void> {
    return this.json("POST", `/intercept/queue/${encodeURIComponent(id)}/drop`);
  }

  getKill(): Promise<KillState> {
    return this.json("GET", "/kill");
  }

  engageKill(): Promise<KillState> {
    return this.json("POST", "/kill");
  }

  resumeKill(): Promise<KillState> {
    return this.json("POST", "/kill/resume");
  }

  listScope(projectId?: string): Promise<ScopeRule[]> {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return this.json("GET", `/scope${qs}`);
  }

  addScope(rule: NewScopeRule): Promise<ScopeRule> {
    return this.json("POST", "/scope", rule);
  }

  deleteScope(id: string): Promise<void> {
    return this.json("DELETE", `/scope/${encodeURIComponent(id)}`);
  }

  listAudit(projectId?: string): Promise<AuditEntry[]> {
    const qs = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
    return this.json("GET", `/audit${qs}`);
  }

  startIntruder(req: IntruderStart): Promise<IntruderJob> {
    return this.json("POST", "/intruder", req);
  }

  getIntruder(id: string): Promise<IntruderJob> {
    return this.json("GET", `/intruder/${encodeURIComponent(id)}`);
  }

  listIntruder(): Promise<IntruderJob[]> {
    return this.json("GET", "/intruder");
  }

  stopIntruder(id: string): Promise<IntruderJob> {
    return this.json("POST", `/intruder/${encodeURIComponent(id)}/stop`);
  }

  listFindings(query: FindingQuery): Promise<FindingList> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      params.set(key, String(value));
    }
    const qs = params.toString();
    return this.json("GET", qs ? `/findings?${qs}` : "/findings");
  }

  getFinding(id: string): Promise<Finding> {
    return this.json("GET", `/findings/${encodeURIComponent(id)}`);
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
    if (res.status === 204) {
      return undefined as T;
    }
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
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
