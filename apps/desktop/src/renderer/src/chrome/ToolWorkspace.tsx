import { useEffect } from "react";
import { Wrench, X } from "lucide-react";
import type { AppSnapshot, FlowDetail, SidebarPanel } from "../../../shared/types";
import { pentestTool } from "../../../shared/toolsCatalog";
import { takeIntruderDraft, takeRepeaterDraft } from "../workbench/pendingSend";
import { queueScannerDraft } from "../workbench/pendingSend";
import { addComparerItem } from "../workbench";
import { setSelectedFlow } from "../flowSelection";
import { TrafficMonitor } from "../TrafficMonitor";
import { RepeaterView } from "../RepeaterView";
import { IntruderView } from "../IntruderView";
import { DecodeView } from "../DecodeView";
import { CookiesView } from "../CookiesView";
import { ScannerView } from "../ScannerView";
import { ReconView } from "../ReconView";
import { SiteMapView } from "../SiteMapView";
import { ComparerView } from "../ComparerView";
import { LoggerView } from "../LoggerView";
import { SequencerView } from "../SequencerView";
import { OobView } from "../OobView";
import { AutorizeView } from "../AutorizeView";
import { NotesView } from "../NotesView";
import { DiscoverView } from "../DiscoverView";
import { GraphqlView } from "../GraphqlView";
import type { FlowSendHandlers } from "../FlowActions";
import { ScopeView } from "../ScopeView";
import { MatchReplaceView } from "../MatchReplaceView";
import { ParamMinerView } from "../ParamMinerView";
import { SmugglingView } from "../SmugglingView";
import { ReportView } from "../ReportView";
import { WebSocketView } from "../WebSocketView";
import { CorsView } from "../CorsView";
import { TOOL_ICONS } from "./ToolsTopBar";

export function ToolWorkspace({
  state,
  panel,
  repeaterDraft,
  intruderDraft,
  onRepeaterDraft,
  onIntruderDraft,
  onDraftConsumed,
  onIntruderDraftConsumed,
}: {
  state: AppSnapshot;
  panel: SidebarPanel;
  repeaterDraft: FlowDetail | null;
  intruderDraft: FlowDetail | null;
  onRepeaterDraft: (flow: FlowDetail) => void;
  onIntruderDraft: (flow: FlowDetail) => void;
  onDraftConsumed: () => void;
  onIntruderDraftConsumed: () => void;
}) {
  useEffect(() => {
    const repeater = takeRepeaterDraft();
    if (repeater) {
      onRepeaterDraft(repeater);
    }
    const intruder = takeIntruderDraft();
    if (intruder) {
      onIntruderDraft(intruder);
    }
  }, [state.tool, onRepeaterDraft, onIntruderDraft]);

  const handlers: FlowSendHandlers = {
    onSendToRepeater: (flow) => {
      setSelectedFlow(flow);
      onRepeaterDraft(flow);
      void window.lurkwire.setTool("repeater");
    },
    onSendToIntruder: (flow) => {
      setSelectedFlow(flow);
      onIntruderDraft(flow);
      void window.lurkwire.setTool("intruder");
    },
    onSendToComparer: (flow) => {
      addComparerItem(flow.id, `${flow.method} ${flow.host}${flow.path}`);
      setSelectedFlow(flow);
      void window.lurkwire.setTool("comparer");
    },
    onSendToScanner: (flow) => {
      setSelectedFlow(flow);
      queueScannerDraft(flow);
      void window.lurkwire.setTool("scanner");
    },
  };

  const tool = pentestTool(panel);
  const host = (() => {
    const tab = state.tabs.find((item) => item.id === state.activeTabId);
    try {
      return tab?.url ? new URL(tab.url).hostname : "";
    } catch {
      return "";
    }
  })();

  return (
    <div className="tool-workspace">
      <div className="tool-workspace-head">
        <div className="tool-workspace-title">
          {(() => {
            const Icon = TOOL_ICONS[panel] ?? Wrench;
            return (
              <span className="tool-workspace-icon" aria-hidden="true">
                <Icon size={16} strokeWidth={2} />
              </span>
            );
          })()}
          <div>
            <strong>{tool?.label ?? "Tool"}</strong>
            {tool?.hint ? <span className="tool-workspace-hint">{tool.hint}</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="tb"
          aria-label="Close tools"
          onClick={() => void window.lurkwire.setPrefs({ sidebarOpen: false })}
        >
          <X size={16} />
        </button>
      </div>
      <div className="tool-workspace-body">
        {panel === "history" || panel === "intercept" ? (
          <TrafficMonitor
            projectId={state.currentProjectId}
            handlers={handlers}
            initialTab={panel === "intercept" ? "intercept" : "live"}
          />
        ) : panel === "repeater" ? (
          <RepeaterView draft={repeaterDraft} onDraftConsumed={onDraftConsumed} />
        ) : panel === "intruder" ? (
          <IntruderView
            projectId={state.currentProjectId}
            draft={intruderDraft}
            onDraftConsumed={onIntruderDraftConsumed}
            onSendToRepeater={handlers.onSendToRepeater}
          />
        ) : panel === "decode" ? (
          <DecodeView />
        ) : panel === "cookies" ? (
          <CookiesView />
        ) : panel === "sequencer" ? (
          <SequencerView />
        ) : panel === "comparer" ? (
          <ComparerView handlers={handlers} />
        ) : panel === "logger" ? (
          <LoggerView projectId={state.currentProjectId} handlers={handlers} />
        ) : panel === "scanner" ? (
          <ScannerView projectId={state.currentProjectId} onSendToRepeater={handlers.onSendToRepeater} />
        ) : panel === "scope" ? (
          <ScopeView projectId={state.currentProjectId} />
        ) : panel === "matchreplace" ? (
          <MatchReplaceView projectId={state.currentProjectId} />
        ) : panel === "paramminer" ? (
          <ParamMinerView projectId={state.currentProjectId} />
        ) : panel === "smuggling" ? (
          <SmugglingView projectId={state.currentProjectId} />
        ) : panel === "report" ? (
          <ReportView projectId={state.currentProjectId} />
        ) : panel === "websocket" ? (
          <WebSocketView />
        ) : panel === "oob" ? (
          <OobView />
        ) : panel === "autorize" ? (
          <AutorizeView projectId={state.currentProjectId} />
        ) : panel === "discover" ? (
          <DiscoverView projectId={state.currentProjectId} />
        ) : panel === "graphql" ? (
          <GraphqlView projectId={state.currentProjectId} />
        ) : panel === "notes" ? (
          <NotesView projectId={state.currentProjectId} />
        ) : panel === "sitemap" ? (
          <SiteMapView projectId={state.currentProjectId} handlers={handlers} />
        ) : panel === "recon" ? (
          <ReconView initialHost={host} />
        ) : panel === "cors" ? (
          <CorsView projectId={state.currentProjectId} />
        ) : (
          <div className="placeholder">
            <h3>{tool?.label ?? panel}</h3>
            <p>{tool?.hint ?? "This tool will land in a later module."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
