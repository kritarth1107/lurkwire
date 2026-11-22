import { useEffect, useRef, useState } from "react";
import type { FlowDetail } from "../../shared/types";
import { isInternalUrl, parseInternalPage } from "../../shared/url";
import { BookmarksBar } from "./chrome/BookmarksBar";
import { FindBar } from "./chrome/FindBar";
import { NavBar } from "./chrome/NavBar";
import { InternalPage } from "./chrome/InternalPage";
import { TabStrip } from "./chrome/TabStrip";
import { ToolsTopBar } from "./chrome/ToolsTopBar";
import { ToolDock } from "./chrome/ToolDock";
import { LlmSidebar } from "./chrome/LlmSidebar";
import { CommandPalette } from "./chrome/CommandPalette";
import { ShortcutsSheet } from "./chrome/ShortcutsSheet";
import { resolveCurrentFlow } from "./flowSelection";
import { dispatchSend } from "./sendActions";
import { hotkeyToSendTarget, type ToolHotkey } from "../../shared/sendTo";
import { PanelHost } from "./chrome/PanelHost";
import { useAppState } from "./useAppState";

export function App() {
  const state = useAppState();
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const [omnibox, setOmnibox] = useState("");
  const [repeaterDraft, setRepeaterDraft] = useState<FlowDetail | null>(null);
  const [intruderDraft, setIntruderDraft] = useState<FlowDetail | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
    const openAllTabs = () => {
      void window.lurkwire.openPanel({
        kind: "alltabs",
        x: 48,
        y: 48,
        width: 420,
        height: 440,
        anchor: { left: 48, top: 36, right: 80, bottom: 56 },
        align: "start",
        placement: "below",
      });
    };
    const offAllTabs = window.lurkwire.onOpenAllTabs(openAllTabs);
    window.addEventListener("lurkwire:open-all-tabs", openAllTabs);
    const offPalette = window.lurkwire.onCommandPalette(() => setPaletteOpen((open) => !open));
    const offHotkey = window.lurkwire.onToolHotkey((id) => {
      void handleToolHotkey(id as ToolHotkey, () => setShortcutsOpen(true));
    });
    const onShortcuts = () => setShortcutsOpen(true);
    window.addEventListener("lurkwire:open-shortcuts", onShortcuts);
    const offEsc = window.lurkwire.onEscape(() => {
      setPaletteOpen(false);
      setShortcutsOpen(false);
      setFindOpen(false);
      void window.lurkwire.closePanel();
    });
    return () => {
      offFocus();
      offFind();
      offAllTabs();
      window.removeEventListener("lurkwire:open-all-tabs", openAllTabs);
      offPalette();
      offHotkey();
      offEsc();
      window.removeEventListener("lurkwire:open-shortcuts", onShortcuts);
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
    state.prefs.toolsDockHeight,
    state.prefs.llmSidebarOpen,
    state.prefs.llmSidebarWidth,
    state.prefs.bookmarksBar,
    findOpen,
    showInternal,
    internalPage,
  ]);

  return (
    <div className="shell" data-theme={state.theme}>
      <TabStrip state={state} />
      <NavBar state={state} omnibox={omnibox} setOmnibox={setOmnibox} urlRef={urlRef} />
      <ToolsTopBar state={state} />
      {state.prefs.bookmarksBar ? <BookmarksBar /> : null}
      <ToolDock
        state={state}
        repeaterDraft={repeaterDraft}
        intruderDraft={intruderDraft}
        onRepeaterDraft={setRepeaterDraft}
        onIntruderDraft={setIntruderDraft}
        onDraftConsumed={() => setRepeaterDraft(null)}
        onIntruderDraftConsumed={() => setIntruderDraft(null)}
      />
      <div className="body">
        <div className="content-col">
          {state.error ? <div className="banner">{state.error}</div> : null}
          {showInternal ? <InternalPage state={state} url={internalUrl} /> : null}
          <main className="stage" ref={stageRef} hidden={showInternal} />
          <FindBar open={findOpen} onClose={() => setFindOpen(false)} />
          <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} state={state} />
          <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </div>
        <LlmSidebar
          state={state}
          onDraft={(flow) => {
            setRepeaterDraft(flow);
            void window.lurkwire.setTool("repeater");
          }}
        />
      </div>
      <PanelHost state={state} />
    </div>
  );
}


async function handleToolHotkey(id: ToolHotkey, openShortcuts: () => void): Promise<void> {
  if (id === "shortcuts") {
    openShortcuts();
    return;
  }
  if (id === "toggle-intercept") {
    const current = await window.lurkwire.getIntercept();
    const enabled = !current.config.enabled;
    await window.lurkwire.setIntercept({
      ...current.config,
      enabled,
      requests: true,
      responses: true,
    });
    if (enabled) {
      await window.lurkwire.setTool("intercept");
    }
    return;
  }
  const target = hotkeyToSendTarget(id);
  if (!target) {
    return;
  }
  const state = await window.lurkwire.getState();
  const tab = state.tabs.find((entry) => entry.id === state.activeTabId);
  const flow = await resolveCurrentFlow(tab?.url);
  if (!flow) {
    window.alert("No captured request to send. Right-click one in Traffic, or browse a site first.");
    return;
  }
  await dispatchSend(flow, target);
}
