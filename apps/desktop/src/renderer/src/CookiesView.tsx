import { useEffect, useMemo, useState } from "react";
import { cookiesToNetscape, type WbCookie } from "../../shared/workbench";
import { downloadText } from "./downloadText";

export function CookiesView() {
  const [items, setItems] = useState<WbCookie[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const next = await window.lurkwire.listSessionCookies();
      setItems(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => `${item.domain} ${item.name} ${item.value} ${item.path}`.toLowerCase().includes(q));
  }, [items, filter]);

  const remove = async (cookie: WbCookie) => {
    setBusy(true);
    try {
      await window.lurkwire.removeSessionCookie({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: cookie.sameSite ?? "",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workbench cookie-manager">
      <div className="workbench-toolbar">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter name, domain, or value…"
          spellCheck={false}
        />
        <span className="meta">{visible.length} of {items.length}</span>
        <button type="button" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
        <button
          type="button"
          disabled={items.length === 0}
          onClick={() => downloadText("cookies.txt", cookiesToNetscape(items))}
        >
          Export Netscape
        </button>
      </div>
      {error ? <div className="banner">{error}</div> : null}
      <div className="table-wrap">
        <table className="history-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Domain</th>
              <th>Path</th>
              <th>Flags</th>
              <th>Value</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((cookie) => (
              <tr key={`${cookie.domain}|${cookie.path}|${cookie.name}`}>
                <td className="mono">{cookie.name}</td>
                <td>{cookie.domain}</td>
                <td>{cookie.path}</td>
                <td>
                  {cookie.secure ? "Secure " : ""}
                  {cookie.httpOnly ? "HttpOnly " : ""}
                  {cookie.sameSite ?? ""}
                </td>
                <td className="mono path" title={cookie.value}>
                  {cookie.value}
                </td>
                <td>
                  <button type="button" onClick={() => void window.lurkwire.copyText(`${cookie.name}=${cookie.value}`)}>
                    Copy
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove(cookie)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  No cookies in this profile yet. Browse a site and refresh.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
