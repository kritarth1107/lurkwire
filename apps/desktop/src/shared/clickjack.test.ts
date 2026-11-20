import { describe, expect, it } from "vitest";
import { buildClickjackPoc } from "./clickjack";

describe("clickjacking PoC", () => {
  it("embeds the target URL in a reviewable iframe page", () => {
    const poc = buildClickjackPoc({ url: "https://httpbin.org/html", title: "Lab" });
    expect(poc.html).toContain('src="https://httpbin.org/html"');
    expect(poc.html).toContain("<iframe");
    expect(poc.html).toContain("Opacity");
    expect(poc.html).toContain("<title>Lab</title>");
    expect(poc.notes.length).toBeGreaterThan(0);
  });

  it("escapes HTML in the URL and title", () => {
    const poc = buildClickjackPoc({ url: 'https://example.com/?q="><script>', title: "A <B>" });
    expect(poc.html).not.toContain('"><script>');
    expect(poc.html).toContain("&quot;&gt;&lt;script&gt;");
    expect(poc.html).toContain("A &lt;B&gt;");
  });
});
