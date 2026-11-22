import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildOmniboxSuggestions,
  type OmniboxSuggestion,
} from "../../../shared/omnibox";
import type { Bookmark, Visit } from "../../../shared/types";

export function useOmniboxSuggestions(query: string, enabled: boolean) {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
  const latest = useRef(query);

  useEffect(() => {
    latest.current = query;
  }, [query]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const q = query.trim();
    if (!q) {
      setVisits([]);
      setSearchSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void window.lurkwire.listVisits(q).then((items) => {
        if (!cancelled && latest.current === query) {
          setVisits(items.slice(0, 8));
        }
      });
      void window.lurkwire.getBookmarks().then((items) => {
        if (!cancelled) {
          setBookmarks(items);
        }
      });
      void window.lurkwire.searchSuggest(q).then((items) => {
        if (!cancelled && latest.current === query) {
          setSearchSuggestions(items);
        }
      });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  const suggestions = useMemo(
    () =>
      enabled
        ? buildOmniboxSuggestions({
            query,
            visits,
            bookmarks,
            searchSuggestions,
          })
        : [],
    [query, visits, bookmarks, searchSuggestions, enabled],
  );

  return suggestions;
}

export function suggestionIcon(kind: OmniboxSuggestion["kind"]): string {
  switch (kind) {
    case "navigate":
      return "→";
    case "search":
    case "suggest":
      return "⌕";
    case "bookmark":
      return "★";
    default:
      return "◌";
  }
}
