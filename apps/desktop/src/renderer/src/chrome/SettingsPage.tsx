import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, AuditEntry, LlmProvider, ScopeKind, ScopeRule, ThemePref } from "../../../shared/types";
import { projectColor } from "../../../shared/projectColor";

const categories = [
  { id: "general", label: "General" },
  { id: "home", label: "Home" },
  { id: "search", label: "Search" },
  { id: "privacy", label: "Privacy & proxy" },
  { id: "projects", label: "Projects" },
  { id: "scope", label: "Scope" },
  { id: "audit", label: "Audit log" },
  { id: "llm", label: "AI models" },
  { id: "recon", label: "Recon" },
  { id: "about", label: "About" },
] as const;

type Cat = (typeof categories)[number]["id"];

export function SettingsPage({ state }: { state: AppSnapshot }) {
  const [cat, setCat] = useState<Cat>("general");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return categories;
    }
    return categories.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  return (
    <div className="settings">
      <nav className="settings-nav">
        <h2>Settings</h2>
        <div className="settings-search">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find in Settings"
          />
        </div>
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cat === item.id ? "active" : undefined}
            onClick={() => setCat(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="settings-main">
        {cat === "general" ? (
          <section>
            <h3>General</h3>
            <div className="settings-row">
              <div>
                <strong>Theme</strong>
                <p>Light and dark Proton colors, or follow the system.</p>
              </div>
              <select
                value={state.prefs.theme}
                onChange={(event) =>
                  void window.lurkwire.setPrefs({ theme: event.target.value as ThemePref })
                }
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
            <div className="settings-row">
              <div>
                <strong>Bookmarks toolbar</strong>
                <p>Show bookmarks under the address bar.</p>
              </div>
              <input
                type="checkbox"
                checked={state.prefs.bookmarksBar}
                onChange={(event) =>
                  void window.lurkwire.setPrefs({ bookmarksBar: event.target.checked })
                }
              />
            </div>
            <div className="settings-row">
              <div>
                <strong>Sidebar position</strong>
              </div>
              <select
                value={state.prefs.sidebarSide}
                onChange={(event) =>
                  void window.lurkwire.setPrefs({
                    sidebarSide: event.target.value as "left" | "right",
                  })
                }
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </div>
          </section>
        ) : null}
        {cat === "home" ? (
          <section>
            <h3>Home</h3>
            <p>New tabs open the Lurkwire start page, with your bookmarks as shortcuts.</p>
          </section>
        ) : null}
        {cat === "search" ? (
          <section>
            <h3>Search</h3>
            <p>The address bar accepts a URL or a host. Search providers will be configurable in a later module.</p>
          </section>
        ) : null}
        {cat === "privacy" ? (
          <section>
            <h3>Privacy & proxy</h3>
            <div className="settings-row">
              <div>
                <strong>Intercepting proxy</strong>
                <p>
                  {state.proxy.status === "ready"
                    ? `Listening on ${state.proxy.listen}`
                    : state.proxy.status === "starting"
                      ? "Starting…"
                      : "Down — traffic is blocked, not sent direct."}
                </p>
              </div>
            </div>
            <div className="settings-row">
              <div>
                <strong>Per-install CA</strong>
                <p>Trusted only inside this app, never installed system-wide.</p>
                <p className="mono">{state.proxy.fingerprint ?? "unavailable"}</p>
                <p className="mono">{state.proxy.caPath ?? ""}</p>
              </div>
            </div>
          </section>
        ) : null}
        {cat === "projects" ? (
          <section>
            <h3>Projects</h3>
            <p>Projects behave like colored containers: tabs in a project share a partition and a color underline.</p>
            {state.projects.map((project) => (
              <div key={project.id} className="settings-row">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 10,
                      background: projectColor(project.id),
                    }}
                  />
                  <strong>{project.name}</strong>
                  {project.id === state.currentProjectId ? <span className="meta">current</span> : null}
                </div>
                {project.id === state.currentProjectId ? null : (
                  <button type="button" className="primary" onClick={() => void window.lurkwire.setProject(project.id)}>
                    Switch
                  </button>
                )}
              </div>
            ))}
            <div className="settings-row">
              <input
                type="text"
                value={newName}
                placeholder="New project name"
                onChange={(event) => setNewName(event.target.value)}
              />
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (newName.trim()) {
                    void window.lurkwire.createProject(newName.trim());
                    setNewName("");
                  }
                }}
              >
                Create
              </button>
            </div>
          </section>
        ) : null}
        {cat === "scope" ? <ScopeSection projectId={state.currentProjectId} /> : null}
        {cat === "audit" ? <AuditSection projectId={state.currentProjectId} /> : null}
        {cat === "llm" ? <LlmSection state={state} /> : null}
        {cat === "recon" ? <ReconSettings /> : null}
        {cat === "about" ? (
          <section>
            <h3>About {state.product}</h3>
            <p>
              Version {state.version}. An AI-native security browser with a built-in intercepting proxy.
            </p>
            <p>
              <button type="button" className="primary" onClick={() => void window.lurkwire.openExternal("https://lurkwire.com")}>
                lurkwire.com
              </button>
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}


function ScopeSection({ projectId }: { projectId: string | null }) {
  const [rules, setRules] = useState<ScopeRule[]>([]);
  const [host, setHost] = useState("");
  const [kind, setKind] = useState<ScopeKind>("include");
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      setRules(await window.lurkwire.listScope(projectId ?? undefined));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
  }, [projectId]);

  return (
    <section>
      <h3>Scope</h3>
      <p>
        Active tools (Repeater, Intruder, and AI send) are denied until an include rule matches.
        Browsing is always captured. Exclude rules win over includes.
      </p>
      {error ? <p>{error}</p> : null}
      {rules.map((rule) => (
        <div key={rule.id} className="settings-row">
          <div>
            <strong>{rule.kind}</strong> {rule.host}
            {rule.port ? `:${rule.port}` : ""} {rule.path_prefix}
            {rule.enabled ? null : <span className="meta"> disabled</span>}
          </div>
          <button type="button" onClick={() => void window.lurkwire.deleteScope(rule.id).then(() => reload())}>
            Remove
          </button>
        </div>
      ))}
      <div className="settings-row">
        <select value={kind} onChange={(event) => setKind(event.target.value as ScopeKind)}>
          <option value="include">Include</option>
          <option value="exclude">Exclude</option>
        </select>
        <input
          type="text"
          value={host}
          placeholder="example.com or *.example.com"
          onChange={(event) => setHost(event.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (!host.trim()) {
              return;
            }
            void window.lurkwire
              .addScope({
                project_id: projectId ?? undefined,
                kind,
                host: host.trim(),
                path_prefix: "/",
              })
              .then(() => {
                setHost("");
                return reload();
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }}
        >
          Add rule
        </button>
      </div>
    </section>
  );
}

function AuditSection({ projectId }: { projectId: string | null }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.lurkwire
      .listAudit(projectId ?? undefined)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId]);

  return (
    <section>
      <h3>Audit log</h3>
      <p>Append-only and hash-chained. The first previous hash is 64 zeros.</p>
      {error ? <p>{error}</p> : null}
      {entries.length === 0 ? <p className="meta">No audit entries yet.</p> : null}
      {entries.map((entry) => (
        <div key={entry.id} className="settings-row">
          <div>
            <strong>{entry.action}</strong> <span className="meta">{entry.actor}</span>
            <p className="mono">{entry.hash.slice(0, 16)}… prev {entry.prev_hash.slice(0, 16)}…</p>
          </div>
          <span className="meta">{new Date(entry.ts).toLocaleString()}</span>
        </div>
      ))}
    </section>
  );
}


function ReconSettings() {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void window.lurkwire.hasShodanKey().then(setHasKey);
  }, []);
  return (
    <section>
      <h3>Recon integrations</h3>
      <p>
        DNS, crt.sh, RDAP, WHOIS, and Wayback run without a key. Shodan is optional. The key is
        stored in the OS secret store and is only sent to api.shodan.io when you run a Shodan
        lookup.
      </p>
      <div className="settings-row">
        <div>
          <strong>Shodan API key</strong>
          <p>{hasKey ? "A key is stored in the OS secret store." : "No key saved yet."}</p>
          {message ? <p>{message}</p> : null}
        </div>
        <input
          type="password"
          value={key}
          placeholder="Paste a key, then save"
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => {
            void window.lurkwire
              .setShodanKey(key)
              .then((saved) => {
                setHasKey(saved);
                setKey("");
                setMessage("Key saved.");
              })
              .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
          }}
        >
          Save key
        </button>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.clearShodanKey().then(() => {
              setHasKey(false);
              setMessage("Key removed.");
            });
          }}
        >
          Remove
        </button>
      </div>
    </section>
  );
}

function LlmSection({ state }: { state: AppSnapshot }) {
  const llm = state.prefs.llm;
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void window.lurkwire.hasLlmKey().then(setHasKey);
  }, []);

  return (
    <section>
      <h3>AI models</h3>
      <p>Bring your own OpenAI, Anthropic, Gemini, or OpenAI-compatible key, or run a local Ollama endpoint. Requests are redacted before they leave the machine unless the endpoint is loopback. A human always sends.</p>
      <div className="settings-row">
        <div>
          <strong>Provider</strong>
        </div>
        <select
          value={llm.provider}
          onChange={(event) =>
            void window.lurkwire.setPrefs({
              llm: { ...llm, provider: event.target.value as LlmProvider },
            })
          }
        >
          <option value="ollama">Ollama (local)</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="gemini">Gemini</option>
          <option value="openai-compatible">OpenAI-compatible</option>
        </select>
      </div>
      <div className="settings-row">
        <div>
          <strong>Model</strong>
        </div>
        <input
          type="text"
          value={llm.model}
          onChange={(event) => void window.lurkwire.setPrefs({ llm: { ...llm, model: event.target.value } })}
        />
      </div>
      <div className="settings-row">
        <div>
          <strong>Base URL</strong>
          <p>Leave blank for the provider default.</p>
        </div>
        <input
          type="text"
          value={llm.baseUrl}
          placeholder="http://127.0.0.1:11434/v1"
          onChange={(event) => void window.lurkwire.setPrefs({ llm: { ...llm, baseUrl: event.target.value } })}
        />
      </div>
      <div className="settings-row">
        <div>
          <strong>Local-only mode</strong>
          <p>Refuse any endpoint that is not on loopback.</p>
        </div>
        <input
          type="checkbox"
          checked={llm.localOnly}
          onChange={(event) =>
            void window.lurkwire.setPrefs({ llm: { ...llm, localOnly: event.target.checked } })
          }
        />
      </div>
      <div className="settings-row">
        <div>
          <strong>API key</strong>
          <p>{hasKey ? "A key is stored in the OS secret store." : "No key saved yet."}</p>
          {message ? <p>{message}</p> : null}
        </div>
        <input
          type="password"
          value={key}
          placeholder="Paste a key, then save"
          onChange={(event) => setKey(event.target.value)}
        />
        <button
          type="button"
          className="primary"
          onClick={() => {
            void window.lurkwire
              .setLlmKey(key)
              .then((saved) => {
                setHasKey(saved);
                setKey("");
                setMessage("Key saved.");
              })
              .catch((err: unknown) => setMessage(err instanceof Error ? err.message : String(err)));
          }}
        >
          Save key
        </button>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.clearLlmKey().then(() => {
              setHasKey(false);
              setMessage("Key removed.");
            });
          }}
        >
          Remove
        </button>
      </div>
    </section>
  );
}
