import { useMemo, useState } from "react";
import {
  INTROSPECTION_QUERY,
  parseIntrospection,
  stubOperation,
  typeByName,
  unwrapTypeName,
  visibleTypes,
  type GqlField,
  type GqlSchema,
} from "../../shared/graphqlSchema";
import { emptyAuth, emptyBody, kv, newId } from "../../shared/workbench";

export function GraphqlView({ projectId }: { projectId: string | null }) {
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("Content-Type: application/json\n");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<GqlSchema | null>(null);
  const [selected, setSelected] = useState("Query");
  const [stub, setStub] = useState("");

  const types = useMemo(() => (schema ? visibleTypes(schema) : []), [schema]);
  const current = schema ? typeByName(schema, selected) : undefined;
  const fields: GqlField[] = current?.fields ?? current?.inputFields ?? [];

  function parsedHeaders() {
    return headers
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(":");
        return { name: idx === -1 ? line : line.slice(0, idx).trim(), value: idx === -1 ? "" : line.slice(idx + 1).trim() };
      });
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const flow = await window.lurkwire.activeSend({
        project_id: projectId ?? undefined,
        method: "POST",
        url,
        headers: parsedHeaders(),
        body: JSON.stringify({ query: INTROSPECTION_QUERY }),
        source: "graphql",
      });
      const body = flow.resp_preview ?? "";
      const parsed = parseIntrospection(JSON.parse(body));
      setSchema(parsed);
      setSelected(parsed.queryType?.name ?? visibleTypes(parsed)[0]?.name ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendToWorkbench(field: GqlField) {
    if (!schema) {
      return;
    }
    const query = stubOperation(schema, selected, field);
    setStub(query);
    const workspace = await window.lurkwire.workbenchGet();
    let collection = workspace.collections.find((item) => item.name === "GraphQL");
    if (!collection) {
      const ts = Date.now();
      collection = {
        id: newId(),
        name: "GraphQL",
        description: "Operations saved from the schema explorer.",
        variables: [],
        auth: emptyAuth("none"),
        createdAt: ts,
        updatedAt: ts,
      };
      workspace.collections.push(collection);
    }
    const request = {
      id: newId(),
      name: `${selected}.${field.name}`,
      method: "POST",
      url,
      params: [],
      headers: parsedHeaders().map((item) => kv(item.name, item.value)),
      body: { ...emptyBody(), mode: "graphql" as const, graphql: { query, variables: "{}" } },
      auth: emptyAuth("none"),
      collectionId: collection.id,
      folderId: null,
      updatedAt: Date.now(),
    };
    workspace.requests.push(request);
    await window.lurkwire.workbenchSave(workspace);
    await window.lurkwire.navigate(`lurkwire://workbench#${request.id}`);
  }

  return (
    <div className="workbench graphql-workbench">
      <p className="hint">
        Run a GraphQL introspection query through the proxy (scope, rate limit, and kill switch apply), then browse the schema.
      </p>
      <div className="repeater-url">
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/graphql" spellCheck={false} aria-label="GraphQL URL" />
        <button type="button" className="primary" disabled={busy || !url.trim()} onClick={() => void run()}>
          {busy ? "Introspecting…" : "Introspect"}
        </button>
      </div>
      <label className="intruder-label">
        Headers
        <textarea className="mono" rows={3} value={headers} onChange={(event) => setHeaders(event.target.value)} spellCheck={false} />
      </label>
      {error ? <p className="error">{error}</p> : null}
      {schema ? (
        <div className="graphql-split">
          <ul className="graphql-types">
            {types.map((item) => (
              <li key={item.name}>
                <button type="button" className={item.name === selected ? "active" : ""} onClick={() => setSelected(item.name)}>
                  <span className="muted">{item.kind.toLowerCase()}</span> {item.name}
                </button>
              </li>
            ))}
          </ul>
          <div className="graphql-fields">
            <h3 className="wb-sub">{current?.name}</h3>
            {current?.description ? <p className="muted">{current.description}</p> : null}
            {fields.map((field) => (
              <div key={field.name} className="graphql-field">
                <div>
                  <strong>{field.name}</strong>{" "}
                  <span className="muted">
                    {(field.args ?? []).map((arg) => `${arg.name}: ${unwrapTypeName(arg.type)}`).join(", ")} → {unwrapTypeName(field.type)}
                  </span>
                </div>
                {current?.kind === "OBJECT" ? (
                  <button type="button" onClick={() => void sendToWorkbench(field)}>
                    Open in Workbench
                  </button>
                ) : null}
              </div>
            ))}
            {current?.enumValues?.length ? (
              <p className="muted">{current.enumValues.map((item) => item.name).join(", ")}</p>
            ) : null}
            {stub ? <pre className="mono">{stub}</pre> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
