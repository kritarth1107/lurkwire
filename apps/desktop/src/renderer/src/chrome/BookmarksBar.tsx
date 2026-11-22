import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import type { Bookmark } from "../../../shared/types";

export function BookmarksBar() {
  const [items, setItems] = useState<Bookmark[]>([]);

  useEffect(() => {
    void window.lurkwire.getBookmarks().then(setItems);
    return window.lurkwire.onBookmarks(setItems);
  }, []);

  return (
    <div className="bookmarks-bar">
      {items.length === 0 ? (
        <span className="bm-empty">
          <Star size={12} strokeWidth={2} />
          Star a page to pin it here
        </span>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="bm"
            title={item.url}
            onClick={() => void window.lurkwire.navigate(item.url)}
            onContextMenu={(event) => {
              event.preventDefault();
              void window.lurkwire.removeBookmark(item.id);
            }}
          >
            <span>{item.title}</span>
          </button>
        ))
      )}
    </div>
  );
}
