import {
  Cookie,
  Crosshair,
  FolderTree,
  GitCompare,
  Globe,
  KeyRound,
  Radio,
  Repeat,
  ScrollText,
  Search,
  Share2,
  ShieldAlert,
  ShieldOff,
  Shuffle,
  StickyNote,
  Radar,
  Activity,
  Wrench,
  Filter,
  Replace,
  ScanSearch,
  Split,
  FileOutput,
  Waypoints,
} from "lucide-react";
import type { AppSnapshot, SidebarPanel } from "../../../shared/types";
import { PENTEST_TOOLS } from "../../../shared/toolsCatalog";
import { Tooltip } from "./Tooltip";

const ICONS: Record<SidebarPanel, typeof Activity> = {
  history: Activity,
  intercept: ShieldOff,
  repeater: Repeat,
  intruder: Crosshair,
  scanner: Radar,
  decode: KeyRound,
  cookies: Cookie,
  sitemap: FolderTree,
  comparer: GitCompare,
  logger: ScrollText,
  sequencer: Shuffle,
  recon: Globe,
  oob: Radio,
  autorize: ShieldAlert,
  discover: Search,
  graphql: Share2,
  notes: StickyNote,
  ai: Wrench,
  scope: Filter,
  matchreplace: Replace,
  paramminer: ScanSearch,
  smuggling: Split,
  report: FileOutput,
  websocket: Waypoints,
};

export function ToolsTopBar({ state }: { state: AppSnapshot }) {
  const open = state.prefs.sidebarOpen;
  const panel = state.prefs.sidebarPanel;

  return (
    <div className="tools-topbar" role="toolbar" aria-label="Pentest tools">
      {PENTEST_TOOLS.map((item) => {
        const Icon = ICONS[item.id] ?? Wrench;
        const active = open && panel === item.id;
        return (
          <Tooltip key={item.id} label={item.label} extra={item.hint}>
            <button
              type="button"
              className={`tool-chip${active ? " active" : ""}`}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => {
                if (active) {
                  void window.lurkwire.setPrefs({ sidebarOpen: false });
                  return;
                }
                void window.lurkwire.setTool(item.id);
              }}
            >
              <Icon size={14} />
              <span>{item.shortName}</span>
            </button>
          </Tooltip>
        );
      })}
      <Tooltip label="API workbench" extra="gRPC, GraphQL, and HTTP collections">
        <button
          type="button"
          className="tool-chip"
          aria-label="API workbench"
          onClick={() => void window.lurkwire.navigate("lurkwire://workbench")}
        >
          <Wrench size={14} />
          <span>Workbench</span>
        </button>
      </Tooltip>
    </div>
  );
}
