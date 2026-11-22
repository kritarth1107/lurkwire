import { useEffect, useState } from "react";
import type { ScopeKind, ScopeRule } from "../../shared/types";
import { EmptyState } from "./EmptyState";

export function ScopeView({ projectId }: { projectId: string | null }) {
  const [rules, setRules] = useState<ScopeRule[]>([]);
  const [host, setHost] = useState("");
  const [kind, setKind] = useState<ScopeKind>("include");
  const [path, setPath] = useState("/");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRules(await window.lurkwire.listScope(projectId ?? undefined));
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId]);

  return (
    <div className="tool-split">
      <div className="tool-list">
        <div className="workbench-toolbar">
          <select value={kind} onChange={(event) => setKind(event.target.value as ScopeKind)} aria-label="Rule kind">
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
          <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="host or *.example.com" spellCheck={false} />
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/path prefix" spellCheck={false} />
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!host.trim()) {
                setError("A host pattern is required.");
                return;
              }
              void window.lurkwire
                .addScope({ project_id: projectId ?? undefined, kind, host: host.trim(), path_prefix: path.trim() || "/" })
                .then(() => {
                  setHost("");
                  setError(null);
                  return refresh();
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
          >
            Add
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {rules.length ? (
          <table className="history-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Host</th>
                <th>Path</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.kind}</td>
                  <td className="path">{rule.host}{rule.port ? `:${rule.port}` : ""}</td>
                  <td>{rule.path_prefix}</td>
                  <td>
                    <button type="button" onClick={() => void window.lurkwire.deleteScope(rule.id).then(() => refresh())}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No scope rules yet">
            Add an include for the host you are testing (for example <code>localhost</code> or <code>demo.testfire.net</code>).
            Active tools like Intruder, Discover, and Param miner stay default-deny until a host is in scope. Right-click a request and choose Add to scope.
          </EmptyState>
        )}
      </div>
      <div className="tool-detail">
        <h3>How scope works</h3>
        <p>Passive traffic is recorded even without includes. Exclude rules always win. Active tools (Repeater to a new host, Intruder, Discover, Param miner, smuggling probes) only run when an include matches.</p>
      </div>
    </div>
  );
}
