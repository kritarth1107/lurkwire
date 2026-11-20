import { useEffect, useRef, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { isNewTabUrl, isSettingsUrl } from "../../shared/url";
import { BookmarksBar } from "./chrome/BookmarksBar";
import { FindBar } from "./chrome/FindBar";
import { NavBar } from "./chrome/NavBar";
import { NewTabPage } from "./chrome/NewTabPage";
import { SettingsPage } from "./chrome/SettingsPage";
import { Sidebar } from "./chrome/Sidebar";
import { TabStrip } from "./chrome/TabStrip";
import { useAppState } from "./useAppState";

export function App() {
  const state = useAppState();
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [omnibox, setOmnibox] = useState("");
  const [repeaterDraft, setRepeaterDraft] = useState<FlowDetail | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.body.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    if (state.chromePage === "settings") {
      setOmnibox("lurkwire://settings");
      return;
    }
    setOmnibox(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url, state.chromePage]);

  useEffect(() => {
    const offFocus = window.lurkwire.onFocusUrl(() => urlRef.current?.focus());
    const offFind = window.lurkwire.onOpenFind(() => setFindOpen(true));
    const offEsc = window.lurkwire.onEscape(() => setFindOpen(false));
    return () => {
      offFocus();
      offFind();
      offEsc();
    };
  }, []);

  const showSettings = state.chromePage === "settings" || isSettingsUrl(activeTab?.url ?? "");
  const showNewTab = !showSettings && isNewTabUrl(activeTab?.url ?? "");

  useEffect(() => {
    const node = stageRef.current;
    if (!node) {
      return;
    }
    const report = () => {
      const rect = node.getBoundingClientRect();
      void window.lurkwire?.reportBounds({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [
    state.prefs.sidebarOpen,
    state.prefs.sidebarWidth,
    state.prefs.bookmarksBar,
    findOpen,
    showSettings,
    showNewTab,
  ]);

  return (
    <div className="shell" data-theme={state.theme}>
      <TabStrip state={state} />
      <NavBar state={state} omnibox={omnibox} setOmnibox={setOmnibox} urlRef={urlRef} />
      {state.prefs.bookmarksBar ? <BookmarksBar /> : null}
      <div className={`body${state.prefs.sidebarSide === "right" ? " sidebar-right" : ""}`}>
        <Sidebar
          state={state}
          repeaterDraft={repeaterDraft}
          onRepeaterDraft={setRepeaterDraft}
          onDraftConsumed={() => setRepeaterDraft(null)}
        />
        <div className="content-col">
          {state.error ? <div className="banner">{state.error}</div> : null}
          {showSettings ? <SettingsPage state={state} /> : null}
          {showNewTab ? <NewTabPage product={state.product} /> : null}
          <main className="stage" ref={stageRef} hidden={showSettings || showNewTab} />
          <FindBar open={findOpen} onClose={() => setFindOpen(false)} />
        </div>
      </div>
    </div>
  );
}
