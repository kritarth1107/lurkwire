import { useEffect, useState } from "react";
import type { FlowSendHandlers } from "./FlowActions";
import { HistoryView } from "./HistoryView";
import { InterceptView } from "./InterceptView";

export function TrafficMonitor({
  projectId,
  handlers,
  initialTab = "live",
}: {
  projectId: string | null;
  handlers: FlowSendHandlers;
  initialTab?: "live" | "intercept";
}) {
  const [tab, setTab] = useState<"live" | "intercept">(initialTab);
  const [paused, setPaused] = useState(0);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await window.lurkwire.getIntercept();
        if (!cancelled) {
          setPaused(next.queue.length);
          setEnabled(next.config.enabled);
        }
      } catch {
        // proxy may be down
      }
    };
    void load();
    const timer = setInterval(() => void load(), 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="traffic-monitor">
      <div className="traffic-tabs" role="tablist" aria-label="Traffic monitor">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "live"}
          className={tab === "live" ? "active" : undefined}
          onClick={() => setTab("live")}
        >
          Live traffic
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "intercept"}
          className={tab === "intercept" ? "active" : undefined}
          onClick={() => setTab("intercept")}
        >
          Intercept{paused ? ` (${paused})` : enabled ? " · on" : ""}
        </button>
      </div>
      <div className="traffic-body">
        {tab === "live" ? (
          <HistoryView projectId={projectId} handlers={handlers} />
        ) : (
          <InterceptView projectId={projectId} onSendToRepeater={handlers.onSendToRepeater} />
        )}
      </div>
    </div>
  );
}
