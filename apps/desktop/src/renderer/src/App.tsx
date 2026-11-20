import { FormEvent, useEffect, useRef, useState } from "react";
import type { ToolId } from "../../shared/types";
import { useAppState } from "./useAppState";

const tools: { id: ToolId; label: string }[] = [
  { id: "browser", label: "Browser" },
  { id: "history", label: "History" },
  { id: "repeater", label: "Repeater" },
];

export function App() {
  const state = useAppState();
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [omnibox, setOmnibox] = useState("");

  useEffect(() => {
    setOmnibox(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void window.lurkwire?.navigate(omnibox);
  };

  return (
    <div className="shell">
      <header className="titlebar">
        <div className="brand">
          <svg className="mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              d="M3 16c3-8 6-8 9 0s6 8 9 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16" r="1.6" fill="currentColor" />
          </svg>
          <span className="name">{state.product}</span>
          <span className="version">v{state.version}</span>
        </div>
        <ProjectPicker
          projects={state.projects}
          currentId={state.currentProjectId}
        />
        <div className={`status ${state.proxy.status}`}>
          <span className="dot" />
          {state.proxy.status === "ready"
            ? `Proxy ${state.proxy.listen}`
            : state.proxy.status === "starting"
              ? "Starting proxy"
              : "Proxy down"}
        </div>
      </header>

      <nav className="tabs" aria-label="Browser tabs">
        {state.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === state.activeTabId ? "tab active" : "tab"}
            onClick={() => void window.lurkwire.switchTab(tab.id)}
          >
            <span className="tab-title">{tab.title || "New tab"}</span>
            <span
              className="tab-close"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                void window.lurkwire.closeTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  void window.lurkwire.closeTab(tab.id);
                }
              }}
            >
              ×
            </span>
          </button>
        ))}
        <button
          type="button"
          className="tab new"
          aria-label="New tab"
          onClick={() => void window.lurkwire.newTab()}
        >
          +
        </button>
      </nav>

      <div className="omnibox-row">
        <div className="nav-buttons">
          <button
            type="button"
            disabled={!activeTab?.canGoBack}
            onClick={() => void window.lurkwire.back()}
            aria-label="Back"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={!activeTab?.canGoForward}
            onClick={() => void window.lurkwire.forward()}
            aria-label="Forward"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() =>
              activeTab?.loading
                ? void window.lurkwire.stop()
                : void window.lurkwire.reload()
            }
            aria-label={activeTab?.loading ? "Stop" : "Reload"}
          >
            {activeTab?.loading ? "■" : "↻"}
          </button>
        </div>
        <form className="omnibox" onSubmit={onSubmit}>
          <span className={`scheme ${state.proxy.status}`}>
            {omnibox.startsWith("http://") ? "http" : "https"}
          </span>
          <input
            type="text"
            value={omnibox}
            onChange={(event) => setOmnibox(event.target.value)}
            placeholder="Enter a URL"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </form>
      </div>

      <nav className="tools" aria-label="Workbench">
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={state.tool === tool.id ? "tool active" : "tool"}
            onClick={() => void window.lurkwire.setTool(tool.id)}
          >
            {tool.label}
          </button>
        ))}
      </nav>

      {state.error ? <div className="banner">{state.error}</div> : null}

      {state.tool === "browser" ? (
        <BrowserStage hasUrl={Boolean(activeTab?.url)} />
      ) : state.tool === "history" ? (
        <Placeholder
          title="HTTP history"
          body="The traffic store is already running in the proxy. The history grid lands next."
        />
      ) : (
        <Placeholder
          title="Repeater"
          body="The sidecar already has POST /repeater/send. The editor UI lands next."
        />
      )}
    </div>
  );
}

function ProjectPicker({
  projects,
  currentId,
}: {
  projects: { id: string; name: string }[];
  currentId: string | null;
}) {
  return (
    <div className="project-chip">
      <span className="dot" />
      <select
        value={currentId ?? ""}
        onChange={(event) => {
          if (event.target.value === "__new") {
            const name = window.prompt("Project name");
            if (name) {
              void window.lurkwire.createProject(name);
            }
            return;
          }
          void window.lurkwire.setProject(event.target.value);
        }}
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
        <option value="__new">New project…</option>
      </select>
    </div>
  );
}

function BrowserStage({ hasUrl }: { hasUrl: boolean }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const report = () => {
      const rect = node.getBoundingClientRect();
      void window.lurkwire?.reportBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, []);

  return (
    <main className="stage" ref={ref}>
      {hasUrl ? null : (
        <div className="welcome">
          <p className="eyebrow">Security browser</p>
          <h1>Every request, captured and replayable.</h1>
          <p className="lede">
            Enter a URL to browse through Lurkwire&apos;s intercepting proxy. The
            per-install CA is trusted only inside this app. If the sidecar is
            down, traffic is blocked instead of going direct.
          </p>
          <ul>
            <li>Tabs and projects each get their own Chromium partition</li>
            <li>HTTPS is intercepted with a local CA, never installed system-wide</li>
            <li>History and Repeater attach to the same traffic store</li>
          </ul>
        </div>
      )}
    </main>
  );
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <main className="stage">
      <div className="welcome">
        <p className="eyebrow">Coming up</p>
        <h1>{title}</h1>
        <p className="lede">{body}</p>
      </div>
    </main>
  );
}
