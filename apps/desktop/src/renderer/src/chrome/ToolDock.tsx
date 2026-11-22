import type { AppSnapshot, FlowDetail } from "../../../shared/types";
import { ToolWorkspace } from "./ToolWorkspace";

export function ToolDock({
  state,
  repeaterDraft,
  intruderDraft,
  onRepeaterDraft,
  onIntruderDraft,
  onDraftConsumed,
  onIntruderDraftConsumed,
}: {
  state: AppSnapshot;
  repeaterDraft: FlowDetail | null;
  intruderDraft: FlowDetail | null;
  onRepeaterDraft: (flow: FlowDetail) => void;
  onIntruderDraft: (flow: FlowDetail) => void;
  onDraftConsumed: () => void;
  onIntruderDraftConsumed: () => void;
}) {
  if (!state.prefs.sidebarOpen) {
    return null;
  }
  const height = state.prefs.toolsDockHeight ?? 380;
  return (
    <div className="tool-dock" style={{ height }}>
      <ToolWorkspace
        state={state}
        panel={state.prefs.sidebarPanel}
        repeaterDraft={repeaterDraft}
        intruderDraft={intruderDraft}
        onRepeaterDraft={onRepeaterDraft}
        onIntruderDraft={onIntruderDraft}
        onDraftConsumed={onDraftConsumed}
        onIntruderDraftConsumed={onIntruderDraftConsumed}
      />
      <div
        className="tool-dock-resizer"
        role="separator"
        aria-label="Resize tools"
        onMouseDown={(event) => {
          event.preventDefault();
          const startY = event.clientY;
          const start = height;
          const onMove = (move: MouseEvent) => {
            const next = Math.min(720, Math.max(220, start + (move.clientY - startY)));
            void window.lurkwire.setPrefs({ toolsDockHeight: next });
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      />
    </div>
  );
}
