import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, Bookmark, DownloadInfo, Visit } from "../../../shared/types";
import { parseInternalPage, type InternalPage as PageId, INTERNAL_TITLES } from "../../../shared/url";
import { SettingsPage } from "./SettingsPage";
import { ExtensionsPage } from "./ExtensionsPage";
import { NewTabPage } from "./NewTabPage";

export function InternalPage({ state, url }: { state: AppSnapshot; url: string }) {
  const page = parseInternalPage(url);
  if (!page) {
    return null;
  }
  if (page === "settings") {
    return <SettingsPage state={state} url={url} />;
  }
  if (page === "newtab") {
    return <NewTabPage product={state.product} />;
  }
  if (page === "downloads") {
    return <DownloadsPage />;
  }
  if (page === "history") {
    return <VisitHistoryPage />;
  }
  if (page === "bookmarks") {
    return <BookmarksPage />;
  }
  if (page === "extensions") {
    return (
      <PageShell page="extensions">
        <ExtensionsPage />
      </PageShell>
    );
  }
  return <AboutPage state={state} />;
}

function PageShell({ page, children }: { page: PageId; children: React.ReactNode }) {
  return (
    <div className="internal-page">
      <h1>{INTERNAL_TITLES[page]}</h1>
      {children}
    </div>
  );
}

function DownloadsPage() {
  const [items, setItems] = useState<DownloadInfo[]>([]);
  useEffect(() => {
    void window.lurkwire.listDownloads().then(setItems);
    return window.lurkwire.onDownloads(setItems);
  }, []);
  return (
    <PageShell page="downloads">
      <p className="lead">Files you downloaded in this window.</p>
      {items.length === 0 ? (
        <p className="internal-empty">No downloads yet.</p>
      ) : (
        <div className="internal-list">
          {items.map((item) => {
            const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
            return (
              <div key={item.id} className="internal-row">
                <div className="grow">
                  <div className="title">{item.filename}</div>
                  <div className="meta">
                    {item.state === "progressing" ? `${pct}%` : item.state} · {item.url}
                  </div>
                </div>
                {item.state === "progressing" ? (
                  <button type="button" onClick={() => void window.lurkwire.cancelDownload(item.id)}>
                    Cancel
                  </button>
                ) : item.path ? (
                  <>
                    <button type="button" onClick={() => void window.lurkwire.showDownload(item.id)}>
                      Show
                    </button>
                    <button type="button" onClick={() => void window.lurkwire.openDownload(item.id)}>
                      Open
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

function VisitHistoryPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Visit[]>([]);
  const load = (q?: string) => {
    void window.lurkwire.listVisits(q).then(setItems);
  };
  useEffect(() => {
    load(query);
  }, [query]);
  return (
    <PageShell page="history">
      <p className="lead">Pages you have visited in Lurkwire.</p>
      <div className="internal-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search history"
        />
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.clearVisits().then(() => setItems([]));
          }}
        >
          Clear browsing data
        </button>
      </div>
      {items.length === 0 ? (
        <p className="internal-empty">No browsing history yet.</p>
      ) : (
        <div className="internal-list">
          {items.map((item) => (
            <div key={item.id} className="internal-row">
              <button
                type="button"
                className="internal-row grow"
                style={{ padding: 0 }}
                onClick={() => void window.lurkwire.navigate(item.url)}
              >
                <div className="grow">
                  <div className="title">{item.title || item.url}</div>
                  <div className="meta">
                    {new Date(item.visitedAt).toLocaleString()} · {item.url}
                    {item.count > 1 ? ` · ${item.count} visits` : ""}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => void window.lurkwire.deleteVisit(item.id).then(setItems)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function BookmarksPage() {
  const [items, setItems] = useState<Bookmark[]>([]);
  useEffect(() => {
    void window.lurkwire.getBookmarks().then(setItems);
    return window.lurkwire.onBookmarks(setItems);
  }, []);
  return (
    <PageShell page="bookmarks">
      <p className="lead">Saved pages, also shown on the bookmarks toolbar.</p>
      {items.length === 0 ? (
        <p className="internal-empty">No bookmarks yet. Use the star in the address bar to save a page.</p>
      ) : (
        <div className="internal-list">
          {items.map((item) => (
            <div key={item.id} className="internal-row">
              <button
                type="button"
                className="internal-row grow"
                style={{ padding: 0 }}
                onClick={() => void window.lurkwire.navigate(item.url)}
              >
                <div className="grow">
                  <div className="title">{item.title || item.url}</div>
                  <div className="meta">{item.url}</div>
                </div>
              </button>
              <button type="button" onClick={() => void window.lurkwire.removeBookmark(item.id)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function AboutPage({ state }: { state: AppSnapshot }) {
  const links = useMemo(
    () =>
      [
        ["Settings", "lurkwire://settings"],
        ["Downloads", "lurkwire://downloads"],
        ["History", "lurkwire://history"],
        ["Bookmarks", "lurkwire://bookmarks"],
        ["Extensions", "lurkwire://extensions"],
      ] as const,
    [],
  );
  return (
    <PageShell page="about">
      <p className="lead">
        Version {state.version}. An AI-native security browser with a built-in intercepting proxy.
      </p>
      <div className="internal-list">
        {links.map(([label, href]) => (
          <button key={href} type="button" className="internal-row" onClick={() => void window.lurkwire.navigate(href)}>
            <div className="grow">
              <div className="title">{label}</div>
              <div className="meta">{href}</div>
            </div>
          </button>
        ))}
      </div>
      <p style={{ marginTop: 16 }}>
        <button type="button" className="primary" onClick={() => void window.lurkwire.openExternal("https://lurkwire.com")}>
          lurkwire.com
        </button>
      </p>
    </PageShell>
  );
}
