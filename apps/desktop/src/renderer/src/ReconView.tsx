import { useMemo, useState } from "react";
import type { ReconResult, ReconSource } from "../../shared/recon";

const SOURCES: { id: ReconSource; label: string }[] = [
  { id: "dns", label: "DNS" },
  { id: "crtsh", label: "crt.sh" },
  { id: "rdap", label: "RDAP" },
  { id: "whois", label: "WHOIS" },
  { id: "wayback", label: "Wayback" },
  { id: "shodan", label: "Shodan" },
];

export function ReconView({ initialHost }: { initialHost?: string }) {
  const [domain, setDomain] = useState(initialHost ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReconResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<ReconSource[]>(SOURCES.filter((item) => item.id !== "shodan").map((item) => item.id));

  const rdapSummary = useMemo(() => summarizeRdap(result?.rdap), [result]);

  async function run(only?: ReconSource) {
    setError(null);
    setBusy(true);
    try {
      const next = await window.lurkwire.runRecon({
        domain,
        sources: only ? [only] : sources,
      });
      setResult(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: ReconSource) {
    setSources((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <div className="recon">
      <p className="hint">
        Lookups talk to public intel sources and your resolver, not to the target application.
        Shodan is optional and needs a key in Settings.
      </p>
      <div className="repeater-url">
        <input
          value={domain}
          onChange={(event) => setDomain(event.target.value)}
          placeholder="example.com"
          aria-label="Domain"
          spellCheck={false}
        />
        <button type="button" className="primary" disabled={busy || !domain.trim()} onClick={() => void run()}>
          {busy ? "Running…" : "Run"}
        </button>
      </div>
      <div className="recon-sources">
        {SOURCES.map((source) => (
          <label key={source.id} className="check">
            <input
              type="checkbox"
              checked={sources.includes(source.id)}
              onChange={() => toggle(source.id)}
            />
            {source.label}
          </label>
        ))}
      </div>
      {error ? <p className="error">{error}</p> : null}
      {result ? (
        <div className="recon-results">
          {result.errors && Object.keys(result.errors).length > 0 ? (
            <ul className="recon-errors">
              {Object.entries(result.errors).map(([source, message]) => (
                <li key={source}>
                  <strong>{source}:</strong> {message}
                </li>
              ))}
            </ul>
          ) : null}
          {result.dns ? (
            <section>
              <h3>DNS</h3>
              {(["a", "aaaa", "mx", "ns", "cname", "txt", "caa"] as const).map((key) =>
                result.dns![key].length ? (
                  <p key={key}>
                    <strong>{key.toUpperCase()}</strong> {result.dns![key].join(" · ")}
                  </p>
                ) : null,
              )}
              {result.dns.soa ? (
                <p>
                  <strong>SOA</strong> {result.dns.soa}
                </p>
              ) : null}
            </section>
          ) : null}
          {result.crtsh ? (
            <section>
              <h3>crt.sh ({result.crtsh.length})</h3>
              <ul>
                {result.crtsh.slice(0, 25).map((entry) => (
                  <li key={String(entry.id)}>
                    <span className="path">{entry.commonName}</span>
                    {entry.names.length > 1 ? ` · ${entry.names.length} names` : ""}
                    {entry.notAfter ? ` · until ${entry.notAfter}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {rdapSummary ? (
            <section>
              <h3>RDAP</h3>
              <p>{rdapSummary}</p>
            </section>
          ) : null}
          {result.whois ? (
            <section>
              <h3>WHOIS</h3>
              <pre className="mono evidence">{result.whois}</pre>
            </section>
          ) : null}
          {result.wayback ? (
            <section>
              <h3>Wayback ({result.wayback.length})</h3>
              <ul>
                {result.wayback.slice(0, 20).map((entry) => (
                  <li key={`${entry.timestamp}-${entry.original}`}>
                    {entry.timestamp} · {entry.status} · {entry.original}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {result.shodan ? (
            <section>
              <h3>Shodan</h3>
              <pre className="mono evidence">{JSON.stringify(result.shodan, null, 2)}</pre>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function summarizeRdap(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const rec = data as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec.ldhName === "string") {
    parts.push(rec.ldhName);
  }
  if (Array.isArray(rec.status)) {
    parts.push(rec.status.map(String).join(", "));
  }
  const vcard = extractOrg(rec);
  if (vcard) {
    parts.push(vcard);
  }
  if (rec.events && Array.isArray(rec.events)) {
    for (const event of rec.events) {
      if (event && typeof event === "object" && "eventAction" in event && "eventDate" in event) {
        parts.push(`${String((event as { eventAction: string }).eventAction)} ${(event as { eventDate: string }).eventDate}`);
      }
    }
  }
  return parts.length ? parts.join(" · ") : JSON.stringify(data).slice(0, 400);
}

function extractOrg(rec: Record<string, unknown>): string | null {
  const entities = rec.entities;
  if (!Array.isArray(entities)) {
    return null;
  }
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") {
      continue;
    }
    const vcard = (entity as { vcardArray?: unknown }).vcardArray;
    if (Array.isArray(vcard) && Array.isArray(vcard[1])) {
      for (const row of vcard[1] as unknown[]) {
        if (Array.isArray(row) && row[0] === "fn") {
          return String(row[3] ?? "");
        }
      }
    }
  }
  return null;
}
