import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FindResult } from "../../../shared/types";

export function FindBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    } else {
      void window.lurkwire.stopFindInPage();
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    return window.lurkwire.onFind((next) => setResult(next));
  }, []);

  if (!open) {
    return null;
  }

  const find = (findNext: boolean, forward = true) => {
    void window.lurkwire.findInPage(query, { findNext, forward, matchCase });
  };

  return (
    <div className="findbar">
      <input
        ref={input}
        value={query}
        placeholder="Find in page"
        onChange={(event) => {
          setQuery(event.target.value);
          void window.lurkwire.findInPage(event.target.value, { findNext: false, forward: true, matchCase });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            find(true, !event.shiftKey);
          }
          if (event.key === "Escape") {
            onClose();
          }
        }}
      />
      <span className="find-count">
        {query && result
          ? result.matches
            ? `${result.activeMatchOrdinal} of ${result.matches}`
            : "No matches"
          : ""}
      </span>
      <label className="find-case">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(event) => {
            const next = event.target.checked;
            setMatchCase(next);
            if (query) {
              void window.lurkwire.findInPage(query, { findNext: false, forward: true, matchCase: next });
            }
          }}
        />
        Match case
      </label>
      <button type="button" className="tb" aria-label="Previous" onClick={() => find(true, false)}>
        <ChevronUp size={16} />
      </button>
      <button type="button" className="tb" aria-label="Next" onClick={() => find(true, true)}>
        <ChevronDown size={16} />
      </button>
      <button type="button" className="tb" aria-label="Close find bar" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
