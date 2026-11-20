import { useEffect, useRef, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { isInternalUrl, parseInternalPage } from "../../shared/url";
import { BookmarksBar } from "./chrome/BookmarksBar";
import { FindBar } from "./chrome/FindBar";
import { NavBar } from "./chrome/NavBar";
import { InternalPage } from "./chrome/InternalPage";
import { Sidebar } from "./chrome/Sidebar";
import { TabStrip } from "./chrome/TabStrip";
import { CommandPalette } from "./chrome/CommandPalette";
import { useAppState } from "./useAppState";

export function App() {
  const state = useAppState();
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [omnibox, setOmnibox] = useState("");
  const [repeaterDraft, setRepeaterDraft] = useState<FlowDetail | null>(null);
  const [intruderDraft, setIntruderDraft] = useState<FlowDetail | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.body.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    setOmnibox(activeTab?.url ?? "lurkwire://newtab");
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const offFocus = window.lurkwire.onFocusUrl(() => urlRef.current?.focus());
    const offFind = window.lurkwire.onOpenFind(() => setFindOpen(true));
    const offPalette = window.lurkwire.onCommandPalette(() => setPaletteOpen((open) => !open));
    const offEsc = window.lurkwire.onEscape(() => {
      setPaletteOpen(false);
      setFindOpen(false);
    });
    return () => {
      offFocus();
      offFind();
      offPalette();
      offEsc();
    };
  }, []);

  const internalUrl = activeTab?.url ?? "";
  const showInternal = isInternalUrl(internalUrl);
  const internalPage = parseInternalPage(internalUrl);

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
    showInternal,
    internalPage,
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
          intruderDraft={intruderDraft}
          onRepeaterDraft={setRepeaterDraft}
          onIntruderDraft={setIntruderDraft}
          onDraftConsumed={() => setRepeaterDraft(null)}
          onIntruderDraftConsumed={() => setIntruderDraft(null)}
        />
        <div className="content-col">
          {state.error ? <div className="banner">{state.error}</div> : null}
          {showInternal ? <InternalPage state={state} url={internalUrl} /> : null}
          <main className="stage" ref={stageRef} hidden={showInternal} />
          <FindBar open={findOpen} onClose={() => setFindOpen(false)} />
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} state={state} />
        </div>
      </div>
    </div>
  );
}
