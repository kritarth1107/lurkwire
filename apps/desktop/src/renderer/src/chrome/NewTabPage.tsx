import { Search } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { Bookmark } from "../../../shared/types";
import { Mark } from "../Mark";

export function NewTabPage({ product }: { product: string }) {
  const [query, setQuery] = useState("");
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  useEffect(() => {
    void window.lurkwire.getBookmarks().then(setBookmarks);
    return window.lurkwire.onBookmarks(setBookmarks);
  }, []);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim()) {
      void window.lurkwire.navigate(query);
    }
  };

  return (
    <div className="newtab">
      <Mark className="mark-lg" />
      <h1>{product}</h1>
      <form className="newtab-search" onSubmit={onSubmit}>
        <Search size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search or enter address"
          spellCheck={false}
          autoFocus
        />
      </form>
      {bookmarks.length > 0 ? (
        <div className="shortcut-grid">
          {bookmarks.slice(0, 8).map((item) => (
            <button
              key={item.id}
              type="button"
              className="shortcut"
              onClick={() => void window.lurkwire.navigate(item.url)}
            >
              <span className="tile">{item.title.slice(0, 1).toUpperCase()}</span>
              <span>{item.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
