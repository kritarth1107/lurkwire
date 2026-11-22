import type { SidebarPanel } from "./types";

export type PentestToolDef = {
  id: SidebarPanel;
  /** Short name shown in the tools topbar. */
  shortName: string;
  /** Full label for tooltips, headings, and the command palette. */
  label: string;
  hint: string;
  keywords: string;
};

/** Hacking / pentest tools only. Browsing history lives in the app menu. */
export const PENTEST_TOOLS: PentestToolDef[] = [
  {
    id: "history",
    shortName: "Traffic",
    label: "HTTP traffic monitor",
    hint: "Live requests and responses, filters, HAR export, and replay",
    keywords: "history proxy flows har monitor live",
  },
  {
    id: "intercept",
    shortName: "Intercept",
    label: "Intercept and edit",
    hint: "Pause a request or response, edit it, then forward, drop, or replay. Ctrl+Shift+I toggles intercept.",
    keywords: "pause intercept mitm edit response hotkey",
  },
  {
    id: "repeater",
    shortName: "Repeater",
    label: "Repeater",
    hint: "Right-click a request and Send to Repeater, or press Ctrl+R. Ctrl+Enter resends.",
    keywords: "replay repeater send-to",
  },
  {
    id: "intruder",
    shortName: "Intruder",
    label: "Intruder",
    hint: "Mark § positions, pick an attack type, and fuzz. Ctrl+I sends the current request here.",
    keywords: "fuzz payload attack cluster sniper",
  },
  {
    id: "scanner",
    shortName: "Scanner",
    label: "Scanner",
    hint: "Queue, findings by severity, evidence, and retest. Right-click a request to Send to Scanner.",
    keywords: "scan finding queue retest",
  },
  {
    id: "decode",
    shortName: "Decode",
    label: "Decoder++",
    hint: "URL, Base64, hex, HTML, JWT, hashes, gzip, decode-all, and hash identifier",
    keywords: "jwt cookie base64 hash gzip decode-all identifier",
  },
  {
    id: "cookies",
    shortName: "Cookies",
    label: "Cookie manager",
    hint: "Inspect, copy, export, or delete session cookies",
    keywords: "cookie jar session netscape",
  },
  {
    id: "sitemap",
    shortName: "Site map",
    label: "Site map",
    hint: "Hosts and paths seen by the proxy",
    keywords: "sitemap tree host",
  },
  {
    id: "comparer",
    shortName: "Comparer",
    label: "Comparer",
    hint: "Diff two responses side by side",
    keywords: "diff compare",
  },
  {
    id: "logger",
    shortName: "Logger",
    label: "Event logger",
    hint: "Filterable proxy event log",
    keywords: "log events",
  },
  {
    id: "sequencer",
    shortName: "Sequencer",
    label: "Sequencer",
    hint: "Measure how random tokens and cookies look",
    keywords: "entropy token csrf",
  },
  {
    id: "recon",
    shortName: "Recon",
    label: "Recon and site intel",
    hint: "Passive intel for the current host",
    keywords: "osint shodan dns",
  },
  {
    id: "oob",
    shortName: "OOB",
    label: "OOB collaborator",
    hint: "Copy a collaborator payload and watch the hit log",
    keywords: "interactsh collaborator burp oob payload",
  },
  {
    id: "autorize",
    shortName: "Autorize",
    label: "Autorize",
    hint: "Replay a request as other sessions",
    keywords: "idor access control session",
  },
  {
    id: "discover",
    shortName: "Discover",
    label: "Content discovery",
    hint: "Wordlist probes for hidden paths and files. Add a host to scope first.",
    keywords: "dirb content discovery wordlist gobuster",
  },
  {
    id: "graphql",
    shortName: "GraphQL",
    label: "GraphQL explorer",
    hint: "Schema, graph, and query lab",
    keywords: "graphql introspection",
  },
  {
    id: "notes",
    shortName: "Notes",
    label: "Notes and CVSS",
    hint: "Engagement notes and scoring",
    keywords: "notes cvss report",
  },

  {
    id: "scope",
    shortName: "Scope",
    label: "Scope manager",
    hint: "Include or exclude hosts. Active tools only run in scope.",
    keywords: "scope include exclude target",
  },
  {
    id: "matchreplace",
    shortName: "Match",
    label: "Match and replace",
    hint: "Automatically rewrite requests or responses, like Burp match/replace",
    keywords: "match replace rewrite mitm header",
  },
  {
    id: "paramminer",
    shortName: "Params",
    label: "Param miner",
    hint: "Discover hidden parameters by comparing status and length to a baseline",
    keywords: "hidden parameter miner debug",
  },
  {
    id: "smuggling",
    shortName: "Smuggle",
    label: "Request smuggling",
    hint: "Run the local CL.TE lab, or probe an in-scope host",
    keywords: "http request smuggling cl.te te.cl desync",
  },
  {
    id: "websocket",
    shortName: "Sockets",
    label: "WebSocket history",
    hint: "Inspect captured WebSocket, SSE, and gRPC frames and replay them",
    keywords: "websocket sse grpc stream replay",
  },
  {
    id: "report",
    shortName: "Report",
    label: "Findings report",
    hint: "Export scanner findings and notes as Markdown or HTML",
    keywords: "report export markdown html findings",
  },
];

export function pentestTool(id: string): PentestToolDef | undefined {
  return PENTEST_TOOLS.find((item) => item.id === id);
}
