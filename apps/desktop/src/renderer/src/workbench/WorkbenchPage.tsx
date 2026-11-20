import {
  ChevronRight,
  Copy,
  FolderPlus,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatBytes, statusClass } from "../../../shared/http";
import {
  SNIPPET_LABELS,
  SNIPPET_LANGUAGES,
  WB_METHODS,
  emptyAuth,
  emptyBody,
  exportPostmanCollection,
  generateSnippet,
  importAny,
  kv,
  newId,
  parseRunnerData,
  toCurl,
  type MatchRule,
  type MatchWhere,
  type SnippetLanguage,
  type WbAuth,
  type WbAuthType,
  type WbBodyMode,
  type WbCollection,
  type RunnerProgress,
  type WbHistoryEntry,
  type WbKv,
  type WbRequest,
  type WbSendResult,
  type WbWorkspace,
} from "../../../shared/workbench";
import { MonacoView } from "../MonacoView";
import { queueIntruderDraft, queueRepeaterDraft } from "./pendingSend";

type ReqTab = "params" | "headers" | "body" | "auth" | "scripts";
type RespTab = "pretty" | "raw" | "headers" | "cookies" | "tests" | "timing";

const AUTH_TYPES: { id: WbAuthType; label: string }[] = [
  { id: "inherit", label: "Inherit" },
  { id: "none", label: "No auth" },
  { id: "bearer", label: "Bearer" },
  { id: "basic", label: "Basic" },
  { id: "apikey", label: "API key" },
  { id: "jwt", label: "JWT" },
  { id: "digest", label: "Digest" },
  { id: "oauth2", label: "OAuth 2.0" },
  { id: "awsv4", label: "AWS Signature" },
];

const BODY_MODES: { id: WbBodyMode; label: string }[] = [
  { id: "none", label: "None" },
  { id: "json", label: "JSON" },
  { id: "raw", label: "Raw" },
  { id: "urlencoded", label: "x-www-form-urlencoded" },
  { id: "formdata", label: "Multipart" },
  { id: "graphql", label: "GraphQL" },
  { id: "binary", label: "Binary" },
];

function pretty(text: string): { text: string; language: string } {
  const trimmed = text.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return { text: JSON.stringify(JSON.parse(trimmed), null, 2), language: "json" };
    } catch {
      /* fall through */
    }
  }
  if (trimmed.startsWith("<")) {
    return { text, language: "html" };
  }
  return { text, language: "plaintext" };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname;
  } catch {
    return null;
  }
}

function requestTitle(req: WbRequest): string {
  return req.name || `${req.method} ${req.url || "New request"}`;
}

export function WorkbenchPage({ url }: { url: string }) {
  const [workspace, setWorkspace] = useState<WbWorkspace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [reqTab, setReqTab] = useState<ReqTab>("params");
  const [respTab, setRespTab] = useState<RespTab>("pretty");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Record<string, WbSendResult>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importName, setImportName] = useState("");
  const [snippetLang, setSnippetLang] = useState<SnippetLanguage>("curl");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [runOpen, setRunOpen] = useState(false);
  const [runData, setRunData] = useState("");
  const [runDelay, setRunDelay] = useState("0");
  const [runStop, setRunStop] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runResults, setRunResults] = useState<RunnerProgress[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    void window.lurkwire.workbenchGet().then((data) => {
      setWorkspace(data);
      const hash = (() => {
        try {
          return decodeURIComponent(new URL(url).hash.replace(/^#/, ""));
        } catch {
          return "";
        }
      })();
      const initial = hash && data.requests.some((item) => item.id === hash) ? hash : data.requests[0]?.id ?? null;
      setActiveRequestId(initial);
      if (initial) {
        setOpenIds([initial]);
      }
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [url]);

  const persist = (next: WbWorkspace) => {
    setWorkspace(next);
    void window.lurkwire.workbenchSave(next).catch((err: unknown) =>
      setError(err instanceof Error ? err.message : String(err)),
    );
  };

  const request = workspace?.requests.find((item) => item.id === activeRequestId) ?? null;
  const collection = workspace && request
    ? workspace.collections.find((item) => item.id === request.collectionId)
    : workspace?.collections[0];
  const result = request ? results[request.id] : undefined;

  const openRequest = (id: string) => {
    setActiveRequestId(id);
    setOpenIds((current) => (current.includes(id) ? current : [...current, id]));
  };

  const patchRequest = (patch: Partial<WbRequest>) => {
    if (!workspace || !request) {
      return;
    }
    persist({
      ...workspace,
      requests: workspace.requests.map((item) =>
        item.id === request.id ? { ...item, ...patch, updatedAt: Date.now() } : item,
      ),
    });
  };

  const onSend = async () => {
    if (!workspace || !request) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      await window.lurkwire.workbenchSave(workspace);
      const next = await window.lurkwire.workbenchSend(request);
      setResults((current) => ({ ...current, [request.id]: next }));
      const refreshed = await window.lurkwire.workbenchGet();
      setWorkspace(refreshed);
      if (next.error && /scope|not in scope|out of scope/i.test(next.error)) {
        setRespTab("raw");
      } else {
        setRespTab(next.tests.some((item) => !item.passed) ? "tests" : "pretty");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setResults((current) => ({
        ...current,
        [request.id]: {
          status: null,
          durationMs: null,
          size: null,
          error: message,
          tests: [],
          logs: [],
        },
      }));
    } finally {
      setSending(false);
    }
  };

  const addToScope = async () => {
    const host = hostOf(request?.url ?? "");
    if (!host) {
      return;
    }
    try {
      await window.lurkwire.addScope({ kind: "include", host });
      setError(null);
      await onSend();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const addRequest = (col: WbCollection) => {
    if (!workspace) {
      return;
    }
    const created: WbRequest = {
      id: newId(),
      name: "New request",
      method: "GET",
      url: "{{baseUrl}}/",
      params: [],
      headers: [kv("Accept", "application/json")],
      body: emptyBody(),
      auth: emptyAuth("inherit"),
      collectionId: col.id,
      folderId: null,
      protocol: "http",
      updatedAt: Date.now(),
    };
    persist({ ...workspace, requests: [...workspace.requests, created] });
    openRequest(created.id);
  };

  const addCollection = () => {
    if (!workspace) {
      return;
    }
    const ts = Date.now();
    const created: WbCollection = {
      id: newId(),
      name: "New collection",
      variables: [kv("baseUrl", "https://httpbin.org")],
      auth: emptyAuth("none"),
      createdAt: ts,
      updatedAt: ts,
    };
    const createdReq: WbRequest = {
      id: newId(),
      name: "New request",
      method: "GET",
      url: "{{baseUrl}}/",
      params: [],
      headers: [kv("Accept", "application/json")],
      body: emptyBody(),
      auth: emptyAuth("inherit"),
      collectionId: created.id,
      folderId: null,
      protocol: "http",
      updatedAt: ts,
    };
    persist({ ...workspace, collections: [...workspace.collections, created], requests: [...workspace.requests, createdReq] });
    openRequest(createdReq.id);
  };

  const onImport = () => {
    if (!workspace || !importText.trim()) {
      return;
    }
    try {
      const incoming = importAny(importText, importName || "import.json");
      if (incoming.warnings.length && incoming.requests.length === 0) {
        setError(incoming.warnings.join(" "));
        return;
      }
      persist({
        ...workspace,
        collections: [...workspace.collections, ...incoming.collections],
        folders: [...workspace.folders, ...incoming.folders],
        requests: [...workspace.requests, ...incoming.requests],
        environments: [...workspace.environments, ...incoming.environments],
      });
      const first = incoming.requests[0];
      if (first) {
        openRequest(first.id);
      }
      setImportOpen(false);
      setImportText("");
      setError(incoming.warnings.join(" ") || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const runAi = async (kind: "request" | "explain" | "tests" | "security" | "document") => {
    if (!request) {
      return;
    }
    setAiBusy(true);
    setAiOutput("");
    try {
      const action = kind === "explain" ? "explain" : kind === "request" ? "draft" : "suggest";
      const pieces = [
        aiPrompt.trim(),
        kind === "request"
          ? "Generate an HTTP request from this instruction. Return a short rationale and a JSON object with method, url, headers (array of {name,value}), and body."
          : "",
        kind === "explain"
          ? `Explain this API response for a human tester.\nRequest: ${request.method} ${request.url}\nStatus: ${result?.status}\nBody:\n${result?.responseText ?? ""}`
          : "",
        kind === "tests"
          ? `Write Postman-compatible pm.test / pm.expect scripts for this request and response.\nRequest: ${request.method} ${request.url}\nStatus: ${result?.status}\nBody:\n${(result?.responseText ?? "").slice(0, 4000)}`
          : "",
        kind === "security"
          ? `Suggest concrete security test cases for this endpoint as draft requests a human can send (authz/IDOR, injection, mass assignment, rate limits). Do not claim you sent anything.\n${request.method} ${request.url}\nHeaders: ${JSON.stringify(request.headers)}\nBody: ${request.body.json || request.body.raw || ""}`
          : "",
        kind === "document"
          ? `Write Markdown documentation for this collection request: purpose, parameters, auth, and example response.\n${request.method} ${request.url}\n${request.description ?? ""}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      const out = await window.lurkwire.llmComplete({ action, raw: pieces });
      setAiOutput(out.text);
      setAiOpen(true);
    } catch (err) {
      setAiOutput(err instanceof Error ? err.message : String(err));
      setAiOpen(true);
    } finally {
      setAiBusy(false);
    }
  };

  const sendToTool = async (tool: "repeater" | "intruder") => {
    if (!result?.flowId) {
      setError("Send the request first so Workbench can hand the captured flow to that tool.");
      return;
    }
    const flow = await window.lurkwire.getFlow(result.flowId);
    if (tool === "repeater") {
      queueRepeaterDraft(flow);
      await window.lurkwire.setTool("repeater");
    } else {
      queueIntruderDraft(flow);
      await window.lurkwire.setTool("intruder");
    }
  };

  const snippet = useMemo(() => (request ? generateSnippet(snippetLang, request) : ""), [request, snippetLang]);
  const curl = useMemo(() => (request ? toCurl(request) : ""), [request]);

  if (!workspace) {
    return (
      <div className="wb">
        <div className="wb-empty">{error ?? "Loading Workbench…"}</div>
      </div>
    );
  }

  return (
    <div className="wb">
      <aside className="wb-side">
        <div className="wb-side-head">
          <div>
            <div className="wb-kicker">lurkwire://workbench</div>
            <h1>Workbench</h1>
          </div>
          <button type="button" className="wb-icon-btn" title="New collection" onClick={addCollection}>
            <FolderPlus size={16} />
          </button>
        </div>
        <div className="wb-env">
          <label>
            Environment
            <select
              value={workspace.activeEnvironmentId ?? ""}
              onChange={(event) => persist({ ...workspace, activeEnvironmentId: event.target.value || null })}
            >
              <option value="">No environment</option>
              {workspace.environments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              const ts = Date.now();
              const created = { id: newId(), name: "New environment", variables: [kv("baseUrl", "https://httpbin.org")], createdAt: ts, updatedAt: ts };
              persist({ ...workspace, environments: [...workspace.environments, created], activeEnvironmentId: created.id });
            }}
          >
            New
          </button>
        </div>
        {workspace.activeEnvironmentId ? (
          <div className="wb-env-vars">
            <KvEditor
              rows={workspace.environments.find((item) => item.id === workspace.activeEnvironmentId)?.variables ?? []}
              onChange={(variables) =>
                persist({
                  ...workspace,
                  environments: workspace.environments.map((item) =>
                    item.id === workspace.activeEnvironmentId ? { ...item, variables, updatedAt: Date.now() } : item,
                  ),
                })
              }
              placeholderKey="baseUrl"
            />
          </div>
        ) : null}
        <div className="wb-tree">
          {workspace.collections.map((col) => (
            <CollectionBranch
              key={col.id}
              collection={col}
              workspace={workspace}
              activeId={activeRequestId}
              onOpen={openRequest}
              onAdd={() => addRequest(col)}
              onRename={(name) =>
                persist({
                  ...workspace,
                  collections: workspace.collections.map((item) => (item.id === col.id ? { ...item, name } : item)),
                })
              }
              onDelete={() =>
                persist({
                  ...workspace,
                  collections: workspace.collections.filter((item) => item.id !== col.id),
                  folders: workspace.folders.filter((item) => item.collectionId !== col.id),
                  requests: workspace.requests.filter((item) => item.collectionId !== col.id),
                })
              }
            />
          ))}
        </div>
        <div className="wb-history">
          <div className="wb-section-label">History</div>
          {workspace.history.length === 0 ? (
            <div className="wb-muted">Sent requests will land here and in the proxy History.</div>
          ) : (
            workspace.history.slice(0, 30).map((item) => (
              <button
                key={item.id}
                type="button"
                className="wb-hist"
                onClick={() => item.requestId && openRequest(item.requestId)}
              >
                <span className={`status-pill ${statusClass(item.status)}`}>{item.status ?? "err"}</span>
                <span className="wb-hist-method">{item.method}</span>
                <span className="wb-hist-url">{item.url}</span>
              </button>
            ))
          )}
        </div>
      </aside>
      <div className="wb-main">
        <div className="wb-toolbar">
          <div className="wb-tabs">
            {openIds.map((id) => {
              const item = workspace.requests.find((req) => req.id === id);
              if (!item) {
                return null;
              }
              return (
                <button
                  key={id}
                  type="button"
                  className={`wb-tab${id === activeRequestId ? " active" : ""}`}
                  onClick={() => setActiveRequestId(id)}
                >
                  <span className="wb-method">{item.method}</span>
                  {requestTitle(item)}
                  <span
                    className="wb-tab-x"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenIds((current) => current.filter((open) => open !== id));
                      if (activeRequestId === id) {
                        const next = openIds.filter((open) => open !== id);
                        setActiveRequestId(next[next.length - 1] ?? workspace.requests[0]?.id ?? null);
                      }
                    }}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </div>
          <div className="wb-toolbar-actions">
            <button type="button" onClick={() => setImportOpen(true)}>
              Import
            </button>
            <button type="button" disabled={!collection} onClick={() => setRunOpen(true)}>
              Run
            </button>
            <button type="button" onClick={() => setRulesOpen(true)}>
              Match / replace
            </button>
            <button
              type="button"
              disabled={!collection}
              onClick={() => {
                if (!collection) {
                  return;
                }
                const data = exportPostmanCollection(
                  collection,
                  workspace.folders.filter((item) => item.collectionId === collection.id),
                  workspace.requests.filter((item) => item.collectionId === collection.id),
                );
                void window.lurkwire.copyText(JSON.stringify(data, null, 2));
              }}
            >
              Export
            </button>
            <button type="button" className={aiOpen ? "active" : ""} onClick={() => setAiOpen((value) => !value)}>
              <Sparkles size={14} /> AI
            </button>
          </div>
        </div>
        {request ? (
          <>
            <div className="wb-urlbar">
              <select value={request.method} onChange={(event) => patchRequest({ method: event.target.value })}>
                {WB_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <input
                value={request.url}
                onChange={(event) => patchRequest({ url: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onSend();
                  }
                }}
                placeholder="https://httpbin.org/get or {{baseUrl}}/users"
                spellCheck={false}
              />
              <button type="button" className="primary" disabled={sending} onClick={() => void onSend()}>
                <Send size={14} />
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
            <div className="wb-name">
              <input
                value={request.name}
                onChange={(event) => patchRequest({ name: event.target.value })}
                placeholder="Request name"
              />
              <button type="button" onClick={() => void window.lurkwire.copyText(curl)} title="Copy as cURL">
                <Copy size={14} /> cURL
              </button>
              <button type="button" onClick={() => void sendToTool("repeater")} disabled={!result?.flowId}>
                Send to Repeater
              </button>
              <button type="button" onClick={() => void sendToTool("intruder")} disabled={!result?.flowId}>
                Send to Intruder
              </button>
            </div>
            <div className="wb-split">
              <div className="wb-req">
                <div className="wb-subtabs">
                  {(["params", "headers", "body", "auth", "scripts"] as const).map((tab) => (
                    <button key={tab} type="button" className={reqTab === tab ? "active" : ""} onClick={() => setReqTab(tab)}>
                      {tab[0]!.toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="wb-req-body">
                  {reqTab === "params" ? (
                    <KvEditor rows={request.params} onChange={(params) => patchRequest({ params })} placeholderKey="page" />
                  ) : null}
                  {reqTab === "headers" ? (
                    <KvEditor rows={request.headers} onChange={(headers) => patchRequest({ headers })} placeholderKey="Content-Type" />
                  ) : null}
                  {reqTab === "body" ? (
                    <BodyEditor request={request} onChange={patchRequest} />
                  ) : null}
                  {reqTab === "auth" ? (
                    <AuthEditor auth={request.auth} onChange={(auth) => patchRequest({ auth })} />
                  ) : null}
                  {reqTab === "scripts" ? (
                    <ScriptsEditor request={request} onChange={patchRequest} />
                  ) : null}
                </div>
              </div>
              <div className="wb-resp">
                <div className="wb-resp-meta">
                  {result ? (
                    <>
                      <span className={`status-pill ${statusClass(result.status)}`}>{result.status ?? "error"}</span>
                      <span>{result.durationMs != null ? `${result.durationMs} ms` : "—"}</span>
                      <span>{result.size != null ? formatBytes(result.size) : "—"}</span>
                      {result.flowId ? <span className="wb-muted">via proxy · {result.flowId.slice(0, 8)}</span> : null}
                    </>
                  ) : (
                    <span className="wb-muted">Response will appear here after you send.</span>
                  )}
                  {error ? <span className="wb-error">{error}</span> : null}
                  {result?.error && /scope/i.test(result.error) ? (
                    <button type="button" className="primary" onClick={() => void addToScope()}>
                      Add host to scope and retry
                    </button>
                  ) : null}
                </div>
                <div className="wb-subtabs">
                  {(["pretty", "raw", "headers", "cookies", "tests", "timing"] as const).map((tab) => (
                    <button key={tab} type="button" className={respTab === tab ? "active" : ""} onClick={() => setRespTab(tab)}>
                      {tab[0]!.toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="wb-resp-view">
                  <ResponsePane tab={respTab} result={result} history={workspace.history.find((item) => item.requestId === request.id)} />
                </div>
              </div>
            </div>
            <div className="wb-snippets">
              <label>
                Snippet
                <select value={snippetLang} onChange={(event) => setSnippetLang(event.target.value as SnippetLanguage)}>
                  {SNIPPET_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {SNIPPET_LABELS[language]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => void window.lurkwire.copyText(snippet)}>
                Copy snippet
              </button>
              <pre>{snippet}</pre>
            </div>
          </>
        ) : (
          <div className="wb-empty">Create a request or import a Postman, Insomnia, OpenAPI, HAR, or cURL collection.</div>
        )}
      </div>
      {importOpen ? (
        <div className="wb-modal" role="dialog">
          <div className="wb-modal-card">
            <h2>Import</h2>
            <p className="lead">Paste a Postman v2.1 collection, Insomnia export, OpenAPI JSON, HAR, or a cURL command.</p>
            <input
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              placeholder="filename (optional, helps detection)"
            />
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="curl https://httpbin.org/get"
              spellCheck={false}
            />
            <div className="wb-modal-actions">
              <button type="button" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={onImport}>
                Import
              </button>
            </div>
          </div>
        </div>
      ) : null}


      {rulesOpen ? (
        <div className="wb-modal" role="dialog">
          <div className="wb-modal-card">
            <h2>Match and replace</h2>
            <p className="lead">
              Enabled rules run on the request URL, headers, and body after variable interpolation and just
              before the proxy send.
            </p>
            {(workspace.matchRules ?? []).map((rule) => (
              <div key={rule.id} className="wb-rule">
                <label className="wb-check">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) =>
                      persist({
                        ...workspace,
                        matchRules: workspace.matchRules.map((item) =>
                          item.id === rule.id ? { ...item, enabled: event.target.checked } : item,
                        ),
                      })
                    }
                  />
                  On
                </label>
                <input
                  value={rule.name}
                  placeholder="Name"
                  onChange={(event) =>
                    persist({
                      ...workspace,
                      matchRules: workspace.matchRules.map((item) =>
                        item.id === rule.id ? { ...item, name: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  value={rule.match}
                  placeholder="Match"
                  onChange={(event) =>
                    persist({
                      ...workspace,
                      matchRules: workspace.matchRules.map((item) =>
                        item.id === rule.id ? { ...item, match: event.target.value } : item,
                      ),
                    })
                  }
                />
                <input
                  value={rule.replace}
                  placeholder="Replace"
                  onChange={(event) =>
                    persist({
                      ...workspace,
                      matchRules: workspace.matchRules.map((item) =>
                        item.id === rule.id ? { ...item, replace: event.target.value } : item,
                      ),
                    })
                  }
                />
                <select
                  value={rule.where}
                  onChange={(event) =>
                    persist({
                      ...workspace,
                      matchRules: workspace.matchRules.map((item) =>
                        item.id === rule.id ? { ...item, where: event.target.value as MatchWhere } : item,
                        ),
                      })
                  }
                >
                  <option value="anywhere">Anywhere</option>
                  <option value="url">URL</option>
                  <option value="headers">Headers</option>
                  <option value="body">Body</option>
                </select>
                <label className="wb-check">
                  <input
                    type="checkbox"
                    checked={rule.regex}
                    onChange={(event) =>
                      persist({
                        ...workspace,
                        matchRules: workspace.matchRules.map((item) =>
                          item.id === rule.id ? { ...item, regex: event.target.checked } : item,
                        ),
                      })
                    }
                  />
                  Regex
                </label>
              </div>
            ))}
            <div className="wb-modal-actions">
              <button
                type="button"
                onClick={() => {
                  const rule: MatchRule = {
                    id: newId(),
                    enabled: true,
                    name: "New rule",
                    match: "",
                    replace: "",
                    regex: false,
                    where: "anywhere",
                  };
                  persist({ ...workspace, matchRules: [...(workspace.matchRules ?? []), rule] });
                }}
              >
                Add rule
              </button>
              <button type="button" onClick={() => setRulesOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {runOpen ? (
        <div className="wb-modal" role="dialog">
          <div className="wb-modal-card">
            <h2>Run collection</h2>
            <p className="lead">
              Sends every request in this collection through the Lurkwire proxy, applying scope, rate
              limits, and the kill switch. Optionally iterate a CSV or JSON data file as template variables.
            </p>
            <label>
              Delay between requests (ms)
              <input value={runDelay} onChange={(event) => setRunDelay(event.target.value)} />
            </label>
            <label className="wb-check">
              <input type="checkbox" checked={runStop} onChange={(event) => setRunStop(event.target.checked)} />
              Stop on a failed test, 5xx, or send error
            </label>
            <textarea
              value={runData}
              onChange={(event) => setRunData(event.target.value)}
              placeholder={'id,q\n1,alpha\n2,beta    or    [{"id":"1","q":"alpha"}]'}
              spellCheck={false}
            />
            {runResults.length ? (
              <div className="wb-tests">
                {runResults.map((item) => (
                  <div key={`${item.index}-${item.requestId}`} className={`wb-test ${item.result.error || (item.result.status ?? 0) >= 400 || item.result.tests.some((test) => !test.passed) ? "fail" : "pass"}`}>
                    <strong>{item.result.status ?? "err"}</strong> {item.name}
                    {item.result.error ? <div className="wb-muted">{item.result.error}</div> : null}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="wb-modal-actions">
              <button type="button" onClick={() => setRunOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className="primary"
                disabled={runBusy || !collection}
                onClick={() => {
                  if (!workspace || !collection) {
                    return;
                  }
                  const ids = workspace.requests.filter((item) => item.collectionId === collection.id).map((item) => item.id);
                  let data;
                  try {
                    data = runData.trim() ? parseRunnerData(runData) : undefined;
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                    return;
                  }
                  setRunBusy(true);
                  setError(null);
                  void window.lurkwire
                    .workbenchSave(workspace)
                    .then(() =>
                      window.lurkwire.workbenchRun({
                        requestIds: ids,
                        data,
                        delayMs: Number(runDelay) || 0,
                        stopOnFail: runStop,
                      }),
                    )
                    .then((items) => setRunResults(items))
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                    .finally(() => setRunBusy(false));
                }}
              >
                {runBusy ? "Running…" : "Run"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {aiOpen ? (
        <div className="wb-ai">
          <div className="wb-ai-head">
            <strong>AI assistant</strong>
            <button type="button" onClick={() => setAiOpen(false)}>
              Close
            </button>
          </div>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Describe a request, or leave blank and use the actions below."
            spellCheck
          />
          <div className="wb-ai-actions">
            <button type="button" disabled={aiBusy} onClick={() => void runAi("request")}>
              Generate request
            </button>
            <button type="button" disabled={aiBusy || !result} onClick={() => void runAi("explain")}>
              Explain response
            </button>
            <button type="button" disabled={aiBusy} onClick={() => void runAi("tests")}>
              Write tests
            </button>
            <button type="button" disabled={aiBusy} onClick={() => void runAi("security")}>
              Security cases
            </button>
            <button type="button" disabled={aiBusy} onClick={() => void runAi("document")}>
              Auto-document
            </button>
          </div>
          <pre className="wb-ai-out">{aiBusy ? "Thinking…" : aiOutput || "Uses the AI connector in Settings, with redaction on cloud providers."}</pre>
        </div>
      ) : null}
    </div>
  );
}

function CollectionBranch({
  collection,
  workspace,
  activeId,
  onOpen,
  onAdd,
  onRename,
  onDelete,
}: {
  collection: WbCollection;
  workspace: WbWorkspace;
  activeId: string | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(true);
  const folders = workspace.folders.filter((item) => item.collectionId === collection.id && !item.parentId);
  const loose = workspace.requests.filter((item) => item.collectionId === collection.id && !item.folderId);
  return (
    <div className="wb-col">
      <div className="wb-col-head">
        <button type="button" className="wb-twist" onClick={() => setOpen((value) => !value)}>
          <ChevronRight size={14} className={open ? "rotated" : ""} />
        </button>
        <input value={collection.name} onChange={(event) => onRename(event.target.value)} />
        <button type="button" className="wb-icon-btn" title="New request" onClick={onAdd}>
          <Plus size={14} />
        </button>
        <button type="button" className="wb-icon-btn" title="Delete collection" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      </div>
      {open ? (
        <div className="wb-col-body">
          {folders.map((folder) => (
            <div key={folder.id} className="wb-folder">
              <div className="wb-folder-name">{folder.name}</div>
              {workspace.requests
                .filter((item) => item.folderId === folder.id)
                .map((item) => (
                  <RequestRow key={item.id} request={item} active={item.id === activeId} onOpen={onOpen} />
                ))}
            </div>
          ))}
          {loose.map((item) => (
            <RequestRow key={item.id} request={item} active={item.id === activeId} onOpen={onOpen} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RequestRow({
  request,
  active,
  onOpen,
}: {
  request: WbRequest;
  active: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <button type="button" className={`wb-req-row${active ? " active" : ""}`} onClick={() => onOpen(request.id)}>
      <span className={`wb-method method-${request.method.toLowerCase()}`}>{request.method}</span>
      <span>{requestTitle(request)}</span>
    </button>
  );
}

function KvEditor({
  rows,
  onChange,
  placeholderKey,
}: {
  rows: WbKv[];
  onChange: (rows: WbKv[]) => void;
  placeholderKey: string;
}) {
  const list = rows.length && !rows[rows.length - 1]?.key && !rows[rows.length - 1]?.value ? rows : [...rows, kv("", "", true)];
  const update = (id: string, patch: Partial<WbKv>) => {
    const next = list.map((item) => (item.id === id ? { ...item, ...patch } : item));
    onChange(next.filter((item, index) => item.key || item.value || index === next.length - 1));
  };
  return (
    <table className="wb-kv">
      <thead>
        <tr>
          <th />
          <th>Key</th>
          <th>Value</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {list.map((item, index) => (
          <tr key={item.id}>
            <td>
              <input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked })} />
            </td>
            <td>
              <input
                value={item.key}
                placeholder={index === list.length - 1 ? placeholderKey : ""}
                onChange={(event) => update(item.id, { key: event.target.value })}
                spellCheck={false}
              />
            </td>
            <td>
              <input
                value={item.secret && item.secretSet && !item.value ? "" : item.value}
                placeholder={item.secret && item.secretSet ? "•••••• (set)" : ""}
                type={item.secret ? "password" : "text"}
                onChange={(event) => update(item.id, { value: event.target.value })}
                spellCheck={false}
              />
            </td>
            <td>
              <button
                type="button"
                className="wb-icon-btn"
                disabled={index === list.length - 1 && !item.key && !item.value}
                onClick={() => onChange(rows.filter((row) => row.id !== item.id))}
              >
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BodyEditor({ request, onChange }: { request: WbRequest; onChange: (patch: Partial<WbRequest>) => void }) {
  const body = request.body;
  return (
    <div className="wb-body-ed">
      <div className="wb-subtabs">
        {BODY_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className={body.mode === mode.id ? "active" : ""}
            onClick={() => onChange({ body: { ...body, mode: mode.id } })}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {body.mode === "none" ? <p className="wb-muted">This request has no body.</p> : null}
      {body.mode === "json" || body.mode === "raw" ? (
        <div className="wb-monaco">
          <MonacoView
            value={body.mode === "json" ? body.json ?? "" : body.raw ?? ""}
            language={body.mode === "json" ? "json" : body.rawLanguage === "xml" ? "xml" : body.rawLanguage === "html" ? "html" : "plaintext"}
            readOnly={false}
            onChange={(value) =>
              onChange({
                body: body.mode === "json" ? { ...body, json: value, raw: value } : { ...body, raw: value },
              })
            }
          />
        </div>
      ) : null}
      {body.mode === "urlencoded" ? (
        <KvEditor
          rows={body.urlencoded ?? []}
          onChange={(urlencoded) => onChange({ body: { ...body, urlencoded } })}
          placeholderKey="field"
        />
      ) : null}
      {body.mode === "formdata" ? (
        <KvEditor
          rows={body.formdata ?? []}
          onChange={(formdata) => onChange({ body: { ...body, formdata } })}
          placeholderKey="field"
        />
      ) : null}
      {body.mode === "graphql" ? (
        <div className="wb-gql">
          <textarea
            value={body.graphql?.query ?? ""}
            onChange={(event) => onChange({ body: { ...body, graphql: { query: event.target.value, variables: body.graphql?.variables ?? "{}" } } })}
            placeholder="query { __typename }"
            spellCheck={false}
          />
          <textarea
            value={body.graphql?.variables ?? "{}"}
            onChange={(event) => onChange({ body: { ...body, graphql: { query: body.graphql?.query ?? "", variables: event.target.value } } })}
            placeholder="{ }"
            spellCheck={false}
          />
        </div>
      ) : null}
      {body.mode === "binary" ? (
        <p className="wb-muted">Binary bodies can be attached when sending a file field from multipart; a standalone file picker will land in a follow-up.</p>
      ) : null}
    </div>
  );
}

function AuthEditor({ auth, onChange }: { auth: WbAuth; onChange: (auth: WbAuth) => void }) {
  return (
    <div className="wb-auth">
      <label>
        Type
        <select value={auth.type} onChange={(event) => onChange({ ...auth, type: event.target.value as WbAuthType })}>
          {AUTH_TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {auth.type === "bearer" ? (
        <label>
          Token
          <input
            value={auth.bearer?.token ?? ""}
            onChange={(event) => onChange({ ...auth, bearer: { token: event.target.value } })}
            spellCheck={false}
          />
        </label>
      ) : null}
      {auth.type === "jwt" ? (
        <>
          <label>
            Token
            <input
              value={auth.jwt?.token ?? ""}
              onChange={(event) => onChange({ ...auth, jwt: { ...(auth.jwt ?? { token: "" }), token: event.target.value } })}
              spellCheck={false}
            />
          </label>
          <label>
            Header
            <input
              value={auth.jwt?.headerName ?? "Authorization"}
              onChange={(event) => onChange({ ...auth, jwt: { token: auth.jwt?.token ?? "", headerName: event.target.value } })}
            />
          </label>
        </>
      ) : null}
      {auth.type === "basic" || auth.type === "digest" ? (
        <>
          <label>
            Username
            <input
              value={auth.type === "basic" ? auth.basic?.username ?? "" : auth.digest?.username ?? ""}
              onChange={(event) =>
                auth.type === "basic"
                  ? onChange({ ...auth, basic: { username: event.target.value, password: auth.basic?.password ?? "" } })
                  : onChange({ ...auth, digest: { username: event.target.value, password: auth.digest?.password ?? "" } })
              }
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={auth.type === "basic" ? auth.basic?.password ?? "" : auth.digest?.password ?? ""}
              onChange={(event) =>
                auth.type === "basic"
                  ? onChange({ ...auth, basic: { username: auth.basic?.username ?? "", password: event.target.value } })
                  : onChange({ ...auth, digest: { username: auth.digest?.username ?? "", password: event.target.value } })
              }
            />
          </label>
        </>
      ) : null}
      {auth.type === "apikey" ? (
        <>
          <label>
            Key
            <input
              value={auth.apikey?.key ?? ""}
              onChange={(event) =>
                onChange({
                  ...auth,
                  apikey: { key: event.target.value, value: auth.apikey?.value ?? "", addTo: auth.apikey?.addTo ?? "header" },
                })
              }
            />
          </label>
          <label>
            Value
            <input
              value={auth.apikey?.value ?? ""}
              onChange={(event) =>
                onChange({
                  ...auth,
                  apikey: { key: auth.apikey?.key ?? "", value: event.target.value, addTo: auth.apikey?.addTo ?? "header" },
                })
              }
            />
          </label>
          <label>
            Add to
            <select
              value={auth.apikey?.addTo ?? "header"}
              onChange={(event) =>
                onChange({
                  ...auth,
                  apikey: {
                    key: auth.apikey?.key ?? "",
                    value: auth.apikey?.value ?? "",
                    addTo: event.target.value as "header" | "query",
                  },
                })
              }
            >
              <option value="header">Header</option>
              <option value="query">Query</option>
            </select>
          </label>
        </>
      ) : null}
      {auth.type === "oauth2" ? (
        <>
          <label>
            Grant
            <select
              value={auth.oauth2?.grant ?? "authorization_code"}
              onChange={(event) =>
                onChange({
                  ...auth,
                  oauth2: {
                    ...(auth.oauth2 ?? { grant: "authorization_code" }),
                    grant: event.target.value as "authorization_code" | "client_credentials",
                  },
                })
              }
            >
              <option value="authorization_code">Authorization code (PKCE)</option>
              <option value="client_credentials">Client credentials</option>
            </select>
          </label>
          <label>
            Access token
            <input
              value={auth.oauth2?.accessToken ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, accessToken: event.target.value } })}
            />
          </label>
          <label>
            Token URL
            <input
              value={auth.oauth2?.tokenUrl ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "client_credentials", ...auth.oauth2, tokenUrl: event.target.value } })}
            />
          </label>
          <label>
            Auth URL
            <input
              value={auth.oauth2?.authUrl ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, authUrl: event.target.value } })}
            />
          </label>
          <label>
            Client ID
            <input
              value={auth.oauth2?.clientId ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, clientId: event.target.value } })}
            />
          </label>
          <label>
            Client secret
            <input
              type="password"
              value={auth.oauth2?.clientSecret ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, clientSecret: event.target.value } })}
            />
          </label>
          <label>
            Scope
            <input
              value={auth.oauth2?.scope ?? ""}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, scope: event.target.value } })}
            />
          </label>
          <label className="wb-check">
            <input
              type="checkbox"
              checked={auth.oauth2?.pkce ?? true}
              onChange={(event) => onChange({ ...auth, oauth2: { grant: auth.oauth2?.grant ?? "authorization_code", ...auth.oauth2, pkce: event.target.checked } })}
            />
            Use PKCE
          </label>
        </>
      ) : null}
      {auth.type === "awsv4" ? (
        <>
          <label>
            Access key
            <input
              value={auth.awsv4?.accessKey ?? ""}
              onChange={(event) =>
                onChange({
                  ...auth,
                  awsv4: {
                    accessKey: event.target.value,
                    secretKey: auth.awsv4?.secretKey ?? "",
                    region: auth.awsv4?.region ?? "us-east-1",
                    service: auth.awsv4?.service ?? "execute-api",
                    sessionToken: auth.awsv4?.sessionToken,
                  },
                })
              }
            />
          </label>
          <label>
            Secret key
            <input
              type="password"
              value={auth.awsv4?.secretKey ?? ""}
              onChange={(event) =>
                onChange({
                  ...auth,
                  awsv4: {
                    accessKey: auth.awsv4?.accessKey ?? "",
                    secretKey: event.target.value,
                    region: auth.awsv4?.region ?? "us-east-1",
                    service: auth.awsv4?.service ?? "execute-api",
                    sessionToken: auth.awsv4?.sessionToken,
                  },
                })
              }
            />
          </label>
          <label>
            Region
            <input
              value={auth.awsv4?.region ?? "us-east-1"}
              onChange={(event) =>
                onChange({
                  ...auth,
                  awsv4: {
                    accessKey: auth.awsv4?.accessKey ?? "",
                    secretKey: auth.awsv4?.secretKey ?? "",
                    region: event.target.value,
                    service: auth.awsv4?.service ?? "execute-api",
                    sessionToken: auth.awsv4?.sessionToken,
                  },
                })
              }
            />
          </label>
          <label>
            Service
            <input
              value={auth.awsv4?.service ?? "execute-api"}
              onChange={(event) =>
                onChange({
                  ...auth,
                  awsv4: {
                    accessKey: auth.awsv4?.accessKey ?? "",
                    secretKey: auth.awsv4?.secretKey ?? "",
                    region: auth.awsv4?.region ?? "us-east-1",
                    service: event.target.value,
                    sessionToken: auth.awsv4?.sessionToken,
                  },
                })
              }
            />
          </label>
        </>
      ) : null}
      {auth.type === "oauth2" && auth.oauth2?.grant === "authorization_code" ? (
        <p className="wb-muted">
          Paste an access token, or use client credentials (sent through the Lurkwire proxy). A full in-app PKCE browser
          flow is still being wired.
        </p>
      ) : null}
    </div>
  );
}

function ScriptsEditor({ request, onChange }: { request: WbRequest; onChange: (patch: Partial<WbRequest>) => void }) {
  return (
    <div className="wb-scripts">
      <label>
        Pre-request
        <textarea
          value={request.preRequestScript ?? ""}
          onChange={(event) => onChange({ preRequestScript: event.target.value })}
          placeholder={"pm.environment.set(\"token\", \"...\");"}
          spellCheck={false}
        />
      </label>
      <label>
        Tests
        <textarea
          value={request.testScript ?? ""}
          onChange={(event) => onChange({ testScript: event.target.value })}
          placeholder={'pm.test("status is 200", () => pm.response.to.have.status(200));'}
          spellCheck={false}
        />
      </label>
    </div>
  );
}

function ResponsePane({
  tab,
  result,
  history,
}: {
  tab: RespTab;
  result?: WbSendResult;
  history?: WbHistoryEntry;
}) {
  if (!result) {
    return <div className="wb-muted">No response yet.</div>;
  }
  if (result.error && !result.responseText) {
    return <div className="wb-error">{result.error}</div>;
  }
  if (tab === "pretty" || tab === "raw") {
    const rendered = tab === "pretty" ? pretty(result.responseText ?? "") : { text: result.responseText ?? "", language: "plaintext" };
    return (
      <div className="wb-monaco">
        <MonacoView value={rendered.text} language={rendered.language} readOnly />
      </div>
    );
  }
  if (tab === "headers") {
    return (
      <pre className="wb-pre">
        {(result.responseHeaders ?? []).map((item) => `${item.name}: ${item.value}`).join("\n") || "(no headers)"}
      </pre>
    );
  }
  if (tab === "cookies") {
    const cookies = (result.responseHeaders ?? []).filter((item) => item.name.toLowerCase() === "set-cookie");
    return (
      <pre className="wb-pre">
        {cookies.map((item) => item.value).join("\n") || "No Set-Cookie headers on this response. The Workbench jar still applies stored cookies on the next send."}
      </pre>
    );
  }
  if (tab === "tests") {
    return (
      <div className="wb-tests">
        {result.logs.length ? <pre className="wb-pre">{result.logs.join("\n")}</pre> : null}
        {result.tests.length === 0 ? <div className="wb-muted">No tests ran.</div> : null}
        {result.tests.map((item, index) => (
          <div key={`${item.name}-${index}`} className={`wb-test ${item.passed ? "pass" : "fail"}`}>
            <strong>{item.passed ? "PASS" : "FAIL"}</strong> {item.name}
            {item.error ? <div className="wb-muted">{item.error}</div> : null}
          </div>
        ))}
      </div>
    );
  }
  return (
    <pre className="wb-pre">
      {[
        `Status: ${result.status ?? "—"}`,
        `Duration: ${result.durationMs ?? "—"} ms`,
        `Size: ${result.size ?? "—"} bytes`,
        `Flow: ${result.flowId ?? "—"}`,
        history ? `Sent at: ${new Date(history.at).toISOString()}` : "",
        result.error ? `Error: ${result.error}` : "",
        "Requests go through the Lurkwire proxy (source=workbench) so scope, rate limit, kill switch, and the audit log all apply.",
      ]
        .filter(Boolean)
        .join("\n")}
    </pre>
  );
}
