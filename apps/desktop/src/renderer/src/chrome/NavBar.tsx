import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CircleStop,
  Download,
  Lock,
  Menu,
  MessageSquare,
  RotateCw,
  ShieldOff,
  Square,
  Star,
  Unlock,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AppSnapshot, InterceptState } from "../../../shared/types";
import { resolveOmnibox, type OmniboxSuggestion } from "../../../shared/omnibox";
import { Mark } from "../Mark";
import { openAnchoredPanel } from "./openPanel";
import { Tooltip } from "./Tooltip";
import { suggestionIcon, useOmniboxSuggestions } from "./useOmnibox";

export function NavBar({
  state,
  omnibox,
  setOmnibox,
  urlRef,
}: {
  state: AppSnapshot;
  omnibox: string;
  setOmnibox: (value: string) => void;
  urlRef: React.RefObject<HTMLInputElement | null>;
}) {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [intercept, setIntercept] = useState<InterceptState | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const interceptBtn = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const skipSuggest = useRef(false);
  const suggestions = useOmniboxSuggestions(omnibox, focused && !skipSuggest.current);
  const open = focused && suggestions.length > 0;
  const top = suggestions[0];
  const completion =
    top?.completion && omnibox && top.completion.toLowerCase().startsWith(omnibox.toLowerCase())
      ? top.completion
      : "";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await window.lurkwire.getIntercept();
        if (!cancelled) {
          setIntercept(next);
        }
      } catch {
        // proxy may be down
      }
    };
    void load();
    const timer = setInterval(() => void load(), 800);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    void window.lurkwire.getBookmarks().then((items) => {
      setBookmarked(Boolean(active?.url && items.some((item) => item.url === active.url)));
    });
    return window.lurkwire.onBookmarks((items) => {
      setBookmarked(Boolean(active?.url && items.some((item) => item.url === active.url)));
    });
  }, [active?.url]);

  useEffect(() => {
    setActiveIndex(0);
  }, [omnibox]);

  const go = (value: string) => {
    skipSuggest.current = true;
    setFocused(false);
    void window.lurkwire.navigate(value);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = open ? suggestions[activeIndex] : null;
    go(chosen?.url ?? resolveOmnibox(omnibox).url ?? omnibox);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(suggestions.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setFocused(false);
      urlRef.current?.blur();
      return;
    }
    if (event.key === "Tab" && completion && completion !== omnibox) {
      event.preventDefault();
      setOmnibox(completion);
    }
  };

  const identityKind = !omnibox
    ? "internal"
    : omnibox.startsWith("lurkwire://") || omnibox.startsWith("about:")
      ? "internal"
      : active?.secure
        ? "secure"
        : "insecure";

  return (
    <div className="navbar">
      <Tooltip label="Back">
        <button
          type="button"
          className="tb"
          aria-label="Back"
          disabled={!active?.canGoBack || state.killed}
          onClick={() => void window.lurkwire.back()}
        >
          <ArrowLeft size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Forward">
        <button
          type="button"
          className="tb"
          aria-label="Forward"
          disabled={!active?.canGoForward || state.killed}
          onClick={() => void window.lurkwire.forward()}
        >
          <ArrowRight size={16} />
        </button>
      </Tooltip>
      <Tooltip label={active?.loading ? "Stop" : "Reload"} shortcut={active?.loading ? "Esc" : "Ctrl+R"}>
        <button
          type="button"
          className="tb"
          aria-label={active?.loading ? "Stop" : "Reload"}
          disabled={state.killed}
          onClick={() => (active?.loading ? void window.lurkwire.stop() : void window.lurkwire.reload())}
        >
          {active?.loading ? <Square size={12} fill="currentColor" /> : <RotateCw size={16} />}
        </button>
      </Tooltip>

      <form className={`urlbar${open ? " suggest-open" : ""}`} onSubmit={onSubmit} ref={formRef}>
        <button
          type="button"
          className={`identity ${identityKind}`}
          title="Site identity"
          aria-label="Site identity"
          onClick={(event) =>
            openAnchoredPanel("identity", event.currentTarget, {
              width: 380,
              height: 560,
              payload: {
                url: active?.url ?? omnibox,
                secure: active?.secure ?? false,
                fingerprint: state.proxy.fingerprint,
                caPath: state.proxy.caPath,
                listen: state.proxy.listen,
              },
            })
          }
        >
          {identityKind === "secure" ? (
            <Lock size={14} />
          ) : identityKind === "internal" ? (
            <Mark className="mark" />
          ) : (
            <Unlock size={14} />
          )}
          {identityKind === "internal" ? <span className="url-badge">Lurkwire</span> : null}
        </button>
        <div className="url-field">
          {completion && focused ? <span className="url-complete">{completion}</span> : null}
          <input
            ref={urlRef}
            type="text"
            value={omnibox}
            onChange={(event) => {
              skipSuggest.current = false;
              setOmnibox(event.target.value);
            }}
            onFocus={() => {
              skipSuggest.current = false;
              setFocused(true);
            }}
            onBlur={() => {
              window.setTimeout(() => setFocused(false), 120);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search Google or enter an address"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="both"
            aria-controls="omnibox-suggestions"
          />
        </div>
        <div className="page-actions">
          <Tooltip label={bookmarked ? "Remove bookmark" : "Bookmark this tab"} shortcut="Ctrl+D">
            <button
              type="button"
              className={`tb${bookmarked ? " starred" : ""}`}
              aria-label="Bookmark this page"
              disabled={!active?.url}
              onClick={() => {
                if (!active?.url) {
                  return;
                }
                if (bookmarked) {
                  void window.lurkwire.getBookmarks().then((items) => {
                    const match = items.find((item) => item.url === active.url);
                    if (match) {
                      void window.lurkwire.removeBookmark(match.id);
                    }
                  });
                  return;
                }
                void window.lurkwire.addBookmark({ title: active.title || active.url, url: active.url });
              }}
            >
              <Star size={16} fill={bookmarked ? "currentColor" : "none"} />
            </button>
          </Tooltip>
        </div>
        {open ? (
          <OmniboxDropdown
            items={suggestions}
            activeIndex={activeIndex}
            onHover={setActiveIndex}
            onPick={(item) => go(item.url)}
          />
        ) : null}
      </form>

      <Tooltip label="Lurkwire tools">
        <button
          type="button"
          className="tb"
          aria-label="Lurkwire tools"
          onClick={(event) => openAnchoredPanel("lurkwire", event.currentTarget, { width: 240, height: 280 })}
        >
          <Mark className="mark" />
        </button>
      </Tooltip>
      <Tooltip label={intercept?.config.enabled ? "Intercept is on" : "Turn intercept on"} shortcut="Ctrl+Shift+I">
        <button
          ref={interceptBtn}
          type="button"
          className={`tb intercept${intercept?.config.enabled ? " active" : ""}`}
          aria-label="Intercept"
          onClick={async () => {
            if (!intercept) {
              return;
            }
            const next = await window.lurkwire.setIntercept({
              ...intercept.config,
              enabled: !intercept.config.enabled,
              requests: true,
              responses: true,
            });
            setIntercept(next);
            if (!state.prefs.sidebarOpen || state.prefs.sidebarPanel !== "intercept") {
              void window.lurkwire.setTool("intercept");
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            openAnchoredPanel("intercept", event.currentTarget, { width: 260, height: 200 });
          }}
        >
          <ShieldOff size={16} />
          {intercept && intercept.queue.length > 0 ? <span className="badge">{intercept.queue.length}</span> : null}
        </button>
      </Tooltip>
      <Tooltip label={state.killed ? "Kill switch is on" : "Kill switch"}>
        <button
          type="button"
          className={`tb danger${state.killed ? " active" : ""}`}
          aria-label="Kill switch"
          onClick={() => void window.lurkwire.setKillSwitch(!state.killed)}
        >
          <CircleStop size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Downloads" shortcut="Ctrl+J">
        <button
          type="button"
          className="tb"
          aria-label="Downloads"
          onClick={(event) => openAnchoredPanel("downloads", event.currentTarget, { width: 360, height: 320 })}
        >
          <Download size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Project">
        <button
          type="button"
          className="tb"
          aria-label="Project"
          onClick={(event) =>
            openAnchoredPanel("project", event.currentTarget, {
              width: 240,
              height: 280,
              payload: { currentId: state.currentProjectId },
            })
          }
          style={{ color: "var(--icon-strong)" }}
        >
          <Bookmark size={16} />
        </button>
      </Tooltip>
      <Tooltip label={state.prefs.llmSidebarOpen ? "Hide assistant" : "Show assistant"}>
        <button
          type="button"
          className={`tb${state.prefs.llmSidebarOpen ? " active" : ""}`}
          aria-label="AI assistant"
          onClick={() => void window.lurkwire.setPrefs({ llmSidebarOpen: !state.prefs.llmSidebarOpen })}
        >
          <MessageSquare size={16} />
        </button>
      </Tooltip>
      <Tooltip label="Application menu" shortcut="Alt">
        <button
          type="button"
          className="tb"
          aria-label="Application menu"
          onClick={(event) =>
            openAnchoredPanel("appmenu", event.currentTarget, {
              width: 320,
              height: 620,
              payload: { zoom: state.zoomFactor },
            })
          }
        >
          <Menu size={16} />
        </button>
      </Tooltip>
    </div>
  );
}

function OmniboxDropdown({
  items,
  activeIndex,
  onHover,
  onPick,
}: {
  items: OmniboxSuggestion[];
  activeIndex: number;
  onHover: (index: number) => void;
  onPick: (item: OmniboxSuggestion) => void;
}) {
  return (
    <div className="omnibox-dropdown" id="omnibox-suggestions" role="listbox">
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`omnibox-item${index === activeIndex ? " active" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(item);
          }}
          onMouseEnter={() => onHover(index)}
        >
          {item.favicon ? (
            <img className="omnibox-favicon" src={item.favicon} alt="" />
          ) : (
            <span className={`omnibox-kind ${item.kind}`}>{suggestionIcon(item.kind)}</span>
          )}
          <span className="omnibox-copy">
            <span className="omnibox-title">{item.title}</span>
            {item.subtitle ? <span className="omnibox-sub">{item.subtitle}</span> : null}
          </span>
        </button>
      ))}
    </div>
  );
}
