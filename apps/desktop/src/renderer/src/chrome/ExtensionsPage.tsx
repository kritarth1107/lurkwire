import { useEffect, useState } from "react";
import type { InstalledExtension } from "../../../shared/extensions";

export function ExtensionsPage() {
  const [items, setItems] = useState<InstalledExtension[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void window.lurkwire
      .listExtensions()
      .then(setItems)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="extensions-page">
      <h3>Extensions</h3>
      <p>
        Load an unpacked Chrome extension from a folder on this machine. The Chrome Web Store is not
        supported. Extensions run in Electron&apos;s subset of <code>chrome.*</code> APIs, Manifest V3
        service workers have the same limits as Chromium, and private windows do not load extensions.
      </p>
      {error ? <div className="banner">{error}</div> : null}
      <div className="workbench-toolbar">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setError(null);
            void window.lurkwire
              .addUnpackedExtension()
              .then((next) => {
                if (next) {
                  setItems(next);
                }
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }}
        >
          Load unpacked
        </button>
      </div>
      {items.length === 0 ? (
        <p className="internal-empty">No extensions loaded yet.</p>
      ) : (
        <ul className="extension-list">
          {items.map((item) => (
            <li key={item.id}>
              <div className="grow">
                <div className="title">
                  {item.name} <span className="muted">v{item.version}</span>
                </div>
                {item.description ? <div className="muted">{item.description}</div> : null}
                <div className="muted mono">{item.path}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void window.lurkwire
                    .removeExtension(item.id)
                    .then(setItems)
                    .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
