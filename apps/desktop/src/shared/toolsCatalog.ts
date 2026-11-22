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
    hint: "Pause a request or response, edit it, then forward, drop, or replay",
    keywords: "pause intercept mitm edit response",
  },
  {
    id: "repeater",
    shortName: "Repeater",
    label: "Repeater",
    hint: "Replay and tweak a single request",
    keywords: "replay repeater",
  },
  {
    id: "intruder",
    shortName: "Intruder",
    label: "Intruder",
    hint: "Payload attacks against marked insertion points",
    keywords: "fuzz payload attack",
  },
  {
    id: "scanner",
    shortName: "Scanner",
    label: "Scanner",
    hint: "Active checks plus the local request-smuggling lab",
    keywords: "scan finding smuggling",
  },
  {
    id: "decode",
    shortName: "Decode",
    label: "Decoder and JWT",
    hint: "Encode, decode, and tamper JWTs or codec recipes",
    keywords: "jwt cookie base64 hash",
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
    hint: "Out-of-band payloads and callbacks",
    keywords: "interactsh collaborator burp",
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
    hint: "Wordlist probes for hidden paths",
    keywords: "dirb content discovery",
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
];

export function pentestTool(id: string): PentestToolDef | undefined {
  return PENTEST_TOOLS.find((item) => item.id === id);
}
