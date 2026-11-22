import { useEffect, useMemo, useState } from "react";
import type { AppSnapshot, Bookmark, DownloadInfo, Visit } from "../../../shared/types";
import { parseInternalPage, type InternalPage as PageId, INTERNAL_TITLES } from "../../../shared/url";
import { SettingsPage } from "./SettingsPage";
import { ExtensionsPage } from "./ExtensionsPage";
import { NewTabPage } from "./NewTabPage";
import { WorkbenchPage } from "../workbench/WorkbenchPage";
import { BrandMark, BrandWordmark } from "../Brand";
import { groupVisitsByDay, visitInRange, type VisitRangeId } from "../../../shared/visitFilter";

export function InternalPage({ state, url }: { state: AppSnapshot; url: string }) {
  const page = parseInternalPage(url);
  if (!page) {
    return null;
  }
  if (page === "settings") {
    return <SettingsPage key={url} state={state} url={url} />;
  }
  if (page === "newtab") {
    return <NewTabPage product={state.product} theme={state.theme} />;
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
  if (page === "workbench") {
    return <WorkbenchPage url={url} />;
  }
  if (page === "reader") {
    return <ReaderPage />;
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
  const [query, setQuery] = useState("");
  useEffect(() => {
    void window.lurkwire.listDownloads().then(setItems);
    return window.lurkwire.onDownloads(setItems);
  }, []);
  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return `${item.filename} ${item.url}`.toLowerCase().includes(q);
  });
  return (
    <PageShell page="downloads">
      <p className="lead">Files you downloaded in this window.</p>
      <div className="internal-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search downloads" />
        <button type="button" onClick={() => void window.lurkwire.clearCompletedDownloads()}>
          Clear completed
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="internal-empty">No downloads yet.</p>
      ) : (
        <div className="internal-list">
          {filtered.map((item) => {
            const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : 0;
            return (
              <div key={item.id} className="internal-row">
                <div className="grow">
                  <div className="title">{item.filename}</div>
                  <div className="meta">
                    {item.state === "progressing" ? (item.paused ? "paused" : `${pct}%`) : item.state} · {item.url}
                  </div>
                  {item.state === "progressing" ? (
                    <div className="download-bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                </div>
                {item.state === "progressing" ? (
                  <>
                    {item.paused ? (
                      <button type="button" onClick={() => void window.lurkwire.resumeDownload(item.id)}>
                        Resume
                      </button>
                    ) : (
                      <button type="button" onClick={() => void window.lurkwire.pauseDownload(item.id)}>
                        Pause
                      </button>
                    )}
                    <button type="button" onClick={() => void window.lurkwire.cancelDownload(item.id)}>
                      Cancel
                    </button>
                  </>
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
  const [range, setRange] = useState<VisitRangeId>("all");
  const [items, setItems] = useState<Visit[]>([]);
  const load = (q?: string) => {
    void window.lurkwire.listVisits(q).then(setItems);
  };
  useEffect(() => {
    load(query);
  }, [query]);
  const visible = items.filter((item) => visitInRange(item.visitedAt, range));
  const groups = groupVisitsByDay(visible);
  return (
    <PageShell page="history">
      <p className="lead">Pages you have visited in Lurkwire.</p>
      <div className="internal-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search history"
        />
        <select value={range} onChange={(event) => setRange(event.target.value as VisitRangeId)} aria-label="Date range">
          <option value="all">All time</option>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <button
          type="button"
          onClick={() => {
            void window.lurkwire.clearVisits().then(() => setItems([]));
          }}
        >
          Clear browsing data
        </button>
      </div>
      {visible.length === 0 ? (
        <p className="internal-empty">No browsing history yet.</p>
      ) : (
        <div className="internal-list">
          {groups.map((group) => (
            <div key={group.label}>
              <h2 className="history-day">{group.label}</h2>
              {group.items.map((item) => (
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
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ReaderPage() {
  const [article, setArticle] = useState<{ title: string; byline: string; text: string; url?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void window.lurkwire
      .getReaderArticle()
      .then((next) => {
        if (!next) {
          setError("Open a page and choose Reader view from the command palette or the Find menu.");
          return;
        }
        setArticle(next);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);
  return (
    <PageShell page="reader">
      {error ? <p className="internal-empty">{error}</p> : null}
      {article ? (
        <article className="reader-article">
          <h2>{article.title}</h2>
          {article.byline ? <p className="reader-byline">{article.byline}</p> : null}
          {article.url ? (
            <p className="meta">
              <button type="button" onClick={() => void window.lurkwire.navigate(article.url!)}>
                Back to original
              </button>
            </p>
          ) : null}
          {article.text.split("\n").map((para, index) => (
            para.trim() ? <p key={index}>{para.trim()}</p> : null
          ))}
        </article>
      ) : null}
    </PageShell>
  );
}

function BookmarksPage() {
  const [items, setItems] = useState<Bookmark[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: "", url: "", folder: "" });
  useEffect(() => {
    void window.lurkwire.getBookmarks().then(setItems);
    return window.lurkwire.onBookmarks(setItems);
  }, []);
  const filtered = items.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return true;
    }
    return `${item.title} ${item.url} ${item.folder ?? ""}`.toLowerCase().includes(q);
  });
  const groups = new Map<string, Bookmark[]>();
  for (const item of filtered) {
    const key = item.folder?.trim() || "Saved";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return (
    <PageShell page="bookmarks">
      <p className="lead">Saved pages, also shown on the bookmarks toolbar. Import Chrome or Firefox bookmarks from Settings.</p>
      <div className="internal-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bookmarks" />
        <button type="button" onClick={() => void window.lurkwire.navigate("lurkwire://settings#privacy")}>
          Import…
        </button>
      </div>
      {items.length === 0 ? (
        <p className="internal-empty">No bookmarks yet. Use the star in the address bar, or import from Settings.</p>
      ) : filtered.length === 0 ? (
        <p className="internal-empty">No bookmarks match that search.</p>
      ) : (
        <div className="internal-list">
          {[...groups.entries()].map(([folder, list]) => (
            <div key={folder} className="bookmark-folder">
              <h4 className="bookmark-folder-title">{folder}</h4>
              {list.map((item) => (
                <div key={item.id} className="internal-row">
                  {editing === item.id ? (
                    <form
                      className="bookmark-edit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void window.lurkwire.updateBookmark(item.id, draft).then((next) => {
                          setItems(next);
                          setEditing(null);
                        });
                      }}
                    >
                      <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Title" />
                      <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="URL" />
                      <input value={draft.folder} onChange={(event) => setDraft({ ...draft, folder: event.target.value })} placeholder="Folder" />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </form>
                  ) : (
                    <>
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
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(item.id);
                          setDraft({ title: item.title, url: item.url, folder: item.folder ?? "" });
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" onClick={() => void window.lurkwire.removeBookmark(item.id)}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              ))}
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
        ["Workbench", "lurkwire://workbench"],
      ] as const,
    [],
  );
  return (
    <PageShell page="about">
      <div className="about-brand">
        <BrandMark className="mark-lg" />
        <BrandWordmark className="about-wordmark" theme={state.theme} />
      </div>
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
