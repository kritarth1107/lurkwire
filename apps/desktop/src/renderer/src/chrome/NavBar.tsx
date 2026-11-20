import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CircleStop,
  Download,
  Lock,
  Menu,
  PanelLeft,
  RotateCw,
  ShieldOff,
  Square,
  Star,
  Unlock,
} from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import type { AppSnapshot, InterceptState } from "../../../shared/types";
import { Mark } from "../Mark";
import { openAnchoredPanel } from "./openPanel";

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
  const interceptBtn = useRef<HTMLButtonElement>(null);

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

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void window.lurkwire.navigate(omnibox);
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
      <button
        type="button"
        className={`tb${state.prefs.sidebarOpen ? " active" : ""}`}
        aria-label="Sidebar"
        title="Sidebar"
        onClick={() => void window.lurkwire.setPrefs({ sidebarOpen: !state.prefs.sidebarOpen })}
      >
        <PanelLeft size={16} />
      </button>
      <button
        type="button"
        className="tb"
        aria-label="Back"
        disabled={!active?.canGoBack || state.killed}
        onClick={() => void window.lurkwire.back()}
      >
        <ArrowLeft size={16} />
      </button>
      <button
        type="button"
        className="tb"
        aria-label="Forward"
        disabled={!active?.canGoForward || state.killed}
        onClick={() => void window.lurkwire.forward()}
      >
        <ArrowRight size={16} />
      </button>
      <button
        type="button"
        className="tb"
        aria-label={active?.loading ? "Stop" : "Reload"}
        disabled={state.killed}
        onClick={() => (active?.loading ? void window.lurkwire.stop() : void window.lurkwire.reload())}
      >
        {active?.loading ? <Square size={12} fill="currentColor" /> : <RotateCw size={16} />}
      </button>

      <form className="urlbar" onSubmit={onSubmit}>
        <button
          type="button"
          className={`identity ${identityKind}`}
          title="Site identity"
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
        <input
          ref={urlRef}
          type="text"
          value={omnibox}
          onChange={(event) => setOmnibox(event.target.value)}
          placeholder="Search or enter address"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <div className="page-actions">
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
        </div>
      </form>

      <button
        type="button"
        className="tb"
        aria-label="Lurkwire tools"
        title="Lurkwire tools"
        onClick={(event) => openAnchoredPanel("lurkwire", event.currentTarget, { width: 240, height: 280 })}
      >
        <Mark className="mark" />
      </button>
      <button
        ref={interceptBtn}
        type="button"
        className={`tb intercept${intercept?.config.enabled ? " active" : ""}`}
        aria-label="Intercept"
        title="Intercept"
        onClick={async () => {
          if (!intercept) {
            return;
          }
          const next = await window.lurkwire.setIntercept({
            ...intercept.config,
            enabled: !intercept.config.enabled,
          });
          setIntercept(next);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          openAnchoredPanel("intercept", event.currentTarget, { width: 260, height: 200 });
        }}
      >
        <ShieldOff size={16} />
        {intercept && intercept.queue.length > 0 ? (
          <span className="badge">{intercept.queue.length}</span>
        ) : null}
      </button>
      <button
        type="button"
        className={`tb danger${state.killed ? " active" : ""}`}
        aria-label="Kill switch"
        title={state.killed ? "Kill switch is on" : "Kill switch"}
        onClick={() => void window.lurkwire.setKillSwitch(!state.killed)}
      >
        <CircleStop size={16} />
      </button>
      <button
        type="button"
        className="tb"
        aria-label="Downloads"
        title="Downloads"
        onClick={(event) => openAnchoredPanel("downloads", event.currentTarget, { width: 360, height: 320 })}
      >
        <Download size={16} />
      </button>
      <button
        type="button"
        className="tb"
        aria-label="Project"
        title="Project"
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
      <button
        type="button"
        className="tb"
        aria-label="Application menu"
        title="Application menu"
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
    </div>
  );
}
