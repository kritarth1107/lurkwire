import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const tokens = readFileSync(join(here, "../renderer/src/tokens.css"), "utf8");
const styles = readFileSync(join(here, "../renderer/src/styles.css"), "utf8");

const REQUIRED = [
  "--surface",
  "--surface-elevated",
  "--border",
  "--accent",
  "--success",
  "--warn",
  "--danger",
  "--text",
  "--text-secondary",
  "--space-1",
  "--space-8",
  "--radius-s",
  "--radius-l",
  "--shadow-sm",
  "--shadow-md",
  "--z-toolbar",
  "--z-dropdown",
  "--z-popover",
  "--z-modal",
  "--z-tooltip",
  "--font",
  "--fs-xs",
  "--fs-md",
  "--fs-xl",
  "--fw-medium",
  "--fw-semibold",
  "--motion-fast",
  "--motion-med",
  "--motion-ease",
];

describe("design tokens", () => {
  it("defines the semantic token system in light and dark themes", () => {
    expect(tokens).toContain(":root");
    expect(tokens).toContain('[data-theme="light"]');
    expect(tokens).toContain('[data-theme="dark"]');
    for (const token of REQUIRED) {
      expect(tokens, `missing ${token}`).toContain(`${token}:`);
    }
  });

  it("vendors Inter and wires styles.css to the token file", () => {
    expect(tokens).toContain('font-family: Inter');
    expect(tokens).toContain("Inter-Regular.woff2");
    expect(tokens).toContain("Inter-SemiBold.woff2");
    expect(styles).toContain('@import "./tokens.css"');
    expect(styles).toContain("font-variant-numeric: tabular-nums");
    expect(styles).toContain("var(--shadow-md)");
    expect(styles).toContain("var(--z-toolbar)");
    expect(styles).toContain("var(--z-dropdown)");
    expect(styles).toContain("var(--z-popover)");
    expect(styles).toContain("var(--z-modal)");
    expect(styles).toContain("var(--z-tooltip)");
  });
});
