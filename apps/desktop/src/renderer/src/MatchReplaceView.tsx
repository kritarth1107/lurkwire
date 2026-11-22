import { useEffect, useState } from "react";
import type { NewProxyMatchRule, ProxyMatchRule } from "../../shared/types";
import { EmptyState } from "./EmptyState";

const empty: NewProxyMatchRule = {
  name: "",
  match: "",
  replace: "",
  regex: false,
  where: "anywhere",
  direction: "both",
  enabled: true,
};

export function MatchReplaceView({ projectId }: { projectId: string | null }) {
  const [rules, setRules] = useState<ProxyMatchRule[]>([]);
  const [draft, setDraft] = useState<NewProxyMatchRule>(empty);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setRules(await window.lurkwire.listMatchRules(projectId ?? undefined));
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [projectId]);

  return (
    <div className="tool-split">
      <div className="tool-list">
        <div className="workbench-toolbar wrap">
          <input value={draft.name ?? ""} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Rule name" />
          <input value={draft.match} onChange={(event) => setDraft({ ...draft, match: event.target.value })} placeholder="Match" spellCheck={false} />
          <input value={draft.replace} onChange={(event) => setDraft({ ...draft, replace: event.target.value })} placeholder="Replace" spellCheck={false} />
          <select value={draft.where} onChange={(event) => setDraft({ ...draft, where: event.target.value as NewProxyMatchRule["where"] })}>
            <option value="anywhere">Anywhere</option>
            <option value="url">URL</option>
            <option value="headers">Headers</option>
            <option value="body">Body</option>
          </select>
          <select value={draft.direction} onChange={(event) => setDraft({ ...draft, direction: event.target.value as NewProxyMatchRule["direction"] })}>
            <option value="both">Request and response</option>
            <option value="request">Request only</option>
            <option value="response">Response only</option>
          </select>
          <label className="check">
            <input type="checkbox" checked={Boolean(draft.regex)} onChange={(event) => setDraft({ ...draft, regex: event.target.checked })} />
            Regex
          </label>
          <button
            type="button"
            className="primary"
            onClick={() => {
              if (!draft.match) {
                setError("A match pattern is required.");
                return;
              }
              void window.lurkwire
                .addMatchRule({ ...draft, project_id: projectId ?? undefined, name: draft.name || "rule" })
                .then(() => {
                  setDraft(empty);
                  setError(null);
                  return refresh();
                })
                .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
            }}
          >
            Add rule
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
        {rules.length ? (
          <table className="history-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Match</th>
                <th>Replace</th>
                <th>Where</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.name}{rule.enabled ? "" : " (off)"}</td>
                  <td className="path">{rule.match}</td>
                  <td className="path">{rule.replace}</td>
                  <td>{rule.where} / {rule.direction}{rule.regex ? " / re" : ""}</td>
                  <td>
                    <button type="button" onClick={() => void window.lurkwire.deleteMatchRule(rule.id).then(() => refresh())}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState title="No match/replace rules">
            Rules rewrite live traffic in the MITM proxy, and also Repeater / Intruder / Discover sends. Example: match <code>User-Agent</code> header values, or replace a staging host in the URL.
          </EmptyState>
        )}
      </div>
      <div className="tool-detail">
        <h3>Live rewrite</h3>
        <p>Request rules run before intercept, so the paused request already shows the rewrite. Response rules run after the upstream reply, before intercept. Intercept edits always win last.</p>
      </div>
    </div>
  );
}
