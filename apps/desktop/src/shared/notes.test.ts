import { expect, test } from "vitest";
import { emptyNote, exportFindingsMarkdown } from "./notes";

test("exports notes and scanner findings as markdown", () => {
  const note = { ...emptyNote("n1"), title: "IDOR on /users", severity: "high" as const, body: "Object IDs are sequential.", host: "example.com", path: "/users/1", method: "GET" };
  const md = exportFindingsMarkdown([note], [
    {
      id: "f",
      project_id: "p",
      flow_id: "flow-1",
      ts: 0,
      check_id: "missing-csp",
      title: "Missing CSP",
      severity: "low",
      detail: "No Content-Security-Policy header.",
      evidence: "content-security-policy: —",
      host: "example.com",
      path: "/",
      method: "GET",
      status: 200,
      count: 1,
    },
  ]);
  expect(md).toContain("# Lurkwire findings");
  expect(md).toContain("IDOR on /users");
  expect(md).toContain("Missing CSP");
  expect(md).toContain("CVSS:3.1");
});

test("includes evidence links for scanner findings", () => {
  const md = exportFindingsMarkdown([], [
    {
      id: "f",
      project_id: "p",
      flow_id: "flow-1",
      ts: 0,
      check_id: "x",
      title: "X",
      severity: "low",
      detail: "",
      evidence: "ev",
      host: "example.com",
      path: "/",
      method: "GET",
      status: 200,
      count: 1,
    },
  ]);
  expect(md).toContain("lurkwire://history#flow-1");
});
