import {
  Crosshair,
  KeyRound,
  Globe,
  History,
  MessageSquare,
  Radar,
  Repeat,
  ShieldOff,
  X,
} from "lucide-react";
import type { AppSnapshot, FlowDetail, SidebarPanel } from "../../../shared/types";
import { HistoryView } from "../HistoryView";
import { InterceptView } from "../InterceptView";
import { RepeaterView } from "../RepeaterView";
import { AiView } from "./AiView";
import { IntruderView } from "../IntruderView";
import { DecodeView } from "../DecodeView";
import { ScannerView } from "../ScannerView";
import { ReconView } from "../ReconView";

const items: { id: SidebarPanel; label: string; icon: typeof History }[] = [
  { id: "history", label: "History", icon: History },
  { id: "intercept", label: "Intercept", icon: ShieldOff },
  { id: "repeater", label: "Repeater", icon: Repeat },
  { id: "intruder", label: "Intruder", icon: Crosshair },
  { id: "decode", label: "Decode", icon: KeyRound },
  { id: "scanner", label: "Scanner", icon: Radar },
  { id: "recon", label: "Recon", icon: Globe },
  { id: "ai", label: "AI", icon: MessageSquare },
];

export function Sidebar({
  state,
  repeaterDraft,
  onRepeaterDraft,
  onDraftConsumed,
}: {
  state: AppSnapshot;
  repeaterDraft: FlowDetail | null;
  onRepeaterDraft: (flow: FlowDetail) => void;
  onDraftConsumed: () => void;
}) {
  const open = state.prefs.sidebarOpen;
  const panel = state.prefs.sidebarPanel;
  const width = state.prefs.sidebarWidth;

  return (
    <aside className="sidebar" style={{ width: open ? width : 46 }}>
      <nav className="sidebar-rail" aria-label="Tools">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-btn${open && panel === item.id ? " active" : ""}`}
            title={item.label}
            aria-label={item.label}
            onClick={() => {
              if (open && panel === item.id) {
                void window.lurkwire.setPrefs({ sidebarOpen: false });
                return;
              }
              void window.lurkwire.setTool(item.id);
            }}
          >
            <item.icon size={18} />
          </button>
        ))}
      </nav>
      {open ? (
        <>
          <div className="sidebar-panel" style={{ width: width - 46 - 5 }}>
            <div className="sidebar-head">
              <span>{items.find((item) => item.id === panel)?.label ?? "Tools"}</span>
              <button
                type="button"
                className="tb"
                aria-label="Close sidebar"
                onClick={() => void window.lurkwire.setPrefs({ sidebarOpen: false })}
              >
                <X size={16} />
              </button>
            </div>
            <div className="sidebar-body">
              {panel === "history" ? (
                <HistoryView
                  projectId={state.currentProjectId}
                  onSendToRepeater={(flow) => {
                    onRepeaterDraft(flow);
                    void window.lurkwire.setTool("repeater");
                  }}
                />
              ) : panel === "repeater" ? (
                <RepeaterView draft={repeaterDraft} onDraftConsumed={onDraftConsumed} />
              ) : panel === "intercept" ? (
                <InterceptView />
              ) : panel === "ai" ? (
                <AiView
                  projectId={state.currentProjectId}
                  onDraft={(flow) => {
                    onRepeaterDraft(flow);
                    void window.lurkwire.setTool("repeater");
                  }}
                />
              ) : panel === "intruder" ? (
                <IntruderView
                  projectId={state.currentProjectId}
                  onSendToRepeater={(flow) => {
                    onRepeaterDraft(flow);
                    void window.lurkwire.setTool("repeater");
                  }}
                />
              ) : panel === "decode" ? (
                <DecodeView />
              ) : panel === "scanner" ? (
                <ScannerView
                  projectId={state.currentProjectId}
                  onSendToRepeater={(flow) => {
                    onRepeaterDraft(flow);
                    void window.lurkwire.setTool("repeater");
                  }}
                />
              ) : panel === "recon" ? (
                <ReconView
                  initialHost={(() => {
                    const tab = state.tabs.find((item) => item.id === state.activeTabId);
                    try {
                      return tab?.url ? new URL(tab.url).hostname : "";
                    } catch {
                      return "";
                    }
                  })()}
                />
              ) : (
                <ComingSoon panel={panel} />
              )}
            </div>
          </div>
          <div
            className="sidebar-resizer"
            onMouseDown={(event) => {
              event.preventDefault();
              const startX = event.clientX;
              const start = width;
              const side = state.prefs.sidebarSide;
              const onMove = (move: MouseEvent) => {
                const delta = side === "right" ? startX - move.clientX : move.clientX - startX;
                const next = Math.min(720, Math.max(280, start + delta));
                void window.lurkwire.setPrefs({ sidebarWidth: next });
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
        </>
      ) : null}
    </aside>
  );
}

export function ComingSoon({ panel }: { panel: string }) {
  const copy: Record<string, { title: string; body: string }> = {
  };
  const item = copy[panel] ?? { title: panel, body: "This tool will land in a later module." };
  return (
    <div className="placeholder">
      <h3>{item.title}</h3>
      <p>{item.body}</p>
    </div>
  );
}

