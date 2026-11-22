import { describe, expect, test } from "vitest";
import { extractArticleFromHtml, isReadable } from "./readerExtract";

describe("reader extract", () => {
  test("prefers article text and drops nav/scripts", () => {
    const html = `<html><head><title>Lab notes</title><meta name="author" content="Ada"></head>
      <body>
        <nav>Home About</nav>
        <script>alert(1)</script>
        <article><h1>Lab notes</h1><p>${"The scanner reported a reflected script in the search box. ".repeat(8)}</p></article>
        <footer>copyright</footer>
      </body></html>`;
    const article = extractArticleFromHtml(html);
    expect(article.title).toBe("Lab notes");
    expect(article.byline).toBe("Ada");
    expect(article.text).toContain("scanner reported");
    expect(article.text).not.toContain("alert(1)");
    expect(article.text).not.toContain("copyright");
    expect(isReadable(article)).toBe(true);
  });
});
