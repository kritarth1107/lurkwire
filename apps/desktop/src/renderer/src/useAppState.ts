import { useEffect, useState } from "react";
import { DEFAULT_PREFS, type AppSnapshot } from "../../shared/types";

const empty: AppSnapshot = {
  product: "Lurkwire",
  version: "0.1.0",
  proxy: { status: "starting" },
  projects: [],
  currentProjectId: null,
  tabs: [],
  activeTabId: null,
  tool: "browser",
  error: null,
  prefs: DEFAULT_PREFS,
  killed: false,
  chromePage: "content",
  zoomFactor: 1,
  theme: "dark",
  maximized: false,
};

export function useAppState(): AppSnapshot {
  const [state, setState] = useState<AppSnapshot>(empty);

  useEffect(() => {
    let cancelled = false;
    const api = window.lurkwire;
    if (!api) {
      return;
    }
    void api.getState().then((snapshot) => {
      if (!cancelled) {
        setState(snapshot);
      }
    });
    const unsubscribe = api.onState((snapshot) => {
      if (!cancelled) {
        setState(snapshot);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}
