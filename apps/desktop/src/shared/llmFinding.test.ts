import { describe, expect, test } from "vitest";
import { formatFindingForLlm, localFindingBrief } from "./llmFinding";
import type { Finding } from "./types";

const finding: Finding = {
  id: "f1",
  project_id: "p",
  flow_id: "flow-1",
  ts: 1,
  check_id: "reflected-xss",
  title: "Reflected XSS in query parameter",
  severity: "high",
  detail: "The name parameter was reflected without encoding.",
  evidence: "Hello <script>alert(1)</script>",
  host: "127.0.0.1",
  path: "/vulnerabilities/xss_r/",
  method: "GET",
  status: 200,
  count: 1,
};

describe("finding briefs", () => {
  test("formats a finding for the model and a local brief", () => {
    const blob = formatFindingForLlm(finding);
    expect(blob).toContain("Reflected XSS");
    expect(blob).toContain("reflected-xss");
    const brief = localFindingBrief(finding, "explain");
    expect(brief).toContain("HTML-encode");
    expect(brief).toContain("Hello <script>alert(1)</script>");
    const suggest = localFindingBrief(finding, "suggest");
    expect(suggest).toContain("Suggested next tests");
  });
});
