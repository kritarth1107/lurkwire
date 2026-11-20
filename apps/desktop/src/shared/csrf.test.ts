import { describe, expect, it } from "vitest";
import { buildCsrfPoc } from "./csrf";

describe("buildCsrfPoc", () => {
  it("emits a hidden-field HTML form for urlencoded POST", () => {
    const poc = buildCsrfPoc({
      method: "POST",
      url: "https://example.com/email/change",
      headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
      body: "email=attacker%40example.com&confirm=1",
    });
    expect(poc.mode).toBe("form");
    expect(poc.html).toContain('action="https://example.com/email/change"');
    expect(poc.html).toContain('name="email"');
    expect(poc.html).toContain('value="attacker@example.com"');
    expect(poc.html).toContain("Submit request");
    expect(poc.html).not.toContain(".submit();");
  });

  it("escapes HTML in field values and uses fetch for JSON", () => {
    const form = buildCsrfPoc({
      method: "POST",
      url: "https://example.com/x",
      headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
      body: 'q=<script>alert(1)</script>',
    });
    expect(form.html).toContain("&lt;script&gt;");
    expect(form.html).not.toContain("<script>alert(1)</script>");

    const json = buildCsrfPoc({
      method: "POST",
      url: "https://httpbin.org/post",
      headers: [
        { name: "Content-Type", value: "application/json" },
        { name: "Authorization", value: "Bearer should-not-appear" },
      ],
      body: '{"ok":true}',
    });
    expect(json.mode).toBe("fetch");
    expect(json.html).toContain("credentials: \"include\"");
    expect(json.html).not.toContain("should-not-appear");
    expect(json.notes.some((item) => /CORS/i.test(item))).toBe(true);
  });
});
