import { PRODUCT_NAME, PRODUCT_VERSION } from "../../shared/product";

const tools = ["Browser", "History", "Repeater", "Intruder", "Scanner", "Recon"];

export function App() {
  return (
    <div className="shell">
      <header className="titlebar">
        <div className="brand">
          <svg
            className="mark"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M3 16c3-8 6-8 9 0s6 8 9 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
            <circle cx="12" cy="16" r="1.6" fill="currentColor" />
          </svg>
          <span className="name">{PRODUCT_NAME}</span>
          <span className="version">v{PRODUCT_VERSION}</span>
        </div>
        <div className="project-chip">
          <span className="dot" />
          Default project
        </div>
      </header>

      <nav className="tabs" aria-label="Browser tabs">
        <button type="button" className="tab active">
          New tab
        </button>
        <button type="button" className="tab new" aria-label="New tab">
          +
        </button>
      </nav>

      <div className="omnibox-row">
        <form
          className="omnibox"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <span className="scheme">https</span>
          <input
            type="text"
            placeholder="Search or enter a URL"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </form>
      </div>

      <nav className="tools" aria-label="Workbench">
        {tools.map((tool, index) => (
          <button
            key={tool}
            type="button"
            className={index === 0 ? "tool active" : "tool"}
          >
            {tool}
          </button>
        ))}
      </nav>

      <main className="stage">
        <div className="welcome">
          <p className="eyebrow">Security browser</p>
          <h1>Every request, captured and replayable.</h1>
          <p className="lede">
            Lurkwire is a Chromium browser with a built-in intercepting proxy.
            Browse as usual. Traffic lands in your project store. The AI drafts;
            you send.
          </p>
          <ul>
            <li>Ubuntu first, then macOS and Windows</li>
            <li>Rust sidecar for TLS MITM, trusted only inside the app</li>
            <li>History, Repeater, and guardrails next</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
