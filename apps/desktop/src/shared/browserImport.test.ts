import { describe, expect, it } from "vitest";
import {
  chromeTimeToMs,
  firefoxTimeToMs,
  isImportableUrl,
  parseChromeBookmarks,
  parseFirefoxBookmarks,
  parseFirefoxProfilesIni,
} from "./browserImport";

describe("browser import parsers", () => {
  it("converts Chrome and Firefox timestamps", () => {
    // 2020-01-15T00:00:00.000Z in Chrome's 1601-based microseconds.
    const chrome = (Date.UTC(2020, 0, 15) - Date.UTC(1601, 0, 1)) * 1000;
    expect(chromeTimeToMs(chrome)).toBe(Date.UTC(2020, 0, 15));
    expect(firefoxTimeToMs(Date.UTC(2020, 0, 15) * 1000)).toBe(Date.UTC(2020, 0, 15));
  });

  it("parses nested Chrome bookmark folders and skips javascript urls", () => {
    const items = parseChromeBookmarks({
      roots: {
        bookmark_bar: {
          children: [
            { type: "url", name: "Example", url: "https://example.com/", date_added: "0" },
            {
              type: "folder",
              name: "Work",
              children: [
                { type: "url", name: "Docs", url: "https://docs.example.com" },
                { type: "url", name: "Script", url: "javascript:alert(1)" },
              ],
            },
          ],
        },
        other: {
          children: [{ type: "url", name: "Other", url: "http://other.test" }],
        },
      },
    });
    expect(items.map((item) => `${item.folder}|${item.title}|${item.url}`)).toEqual([
      "Bookmarks bar|Example|https://example.com/",
      "Bookmarks bar/Work|Docs|https://docs.example.com",
      "Other bookmarks|Other|http://other.test",
    ]);
    expect(isImportableUrl("javascript:alert(1)")).toBe(false);
  });

  it("parses Firefox bookmark rows and profiles.ini paths", () => {
    const items = parseFirefoxBookmarks([
      { id: 2, type: 2, parent: 1, title: "toolbar", url: null, dateAdded: null },
      { id: 3, type: 2, parent: 2, title: "News", url: null, dateAdded: null },
      { id: 4, type: 1, parent: 3, title: "BBC", url: "https://bbc.com", dateAdded: Date.UTC(2021, 0, 1) * 1000 },
    ]);
    expect(items).toEqual([
      {
        title: "BBC",
        url: "https://bbc.com",
        folder: "Bookmarks toolbar/News",
        createdAt: Date.UTC(2021, 0, 1),
      },
    ]);
    const profiles = parseFirefoxProfilesIni(
      `[General]\nStartWithLastProfile=1\n\n[Profile0]\nName=default-release\nIsRelative=1\nPath=abc.default-release\nDefault=1\n`,
      "/home/me/.mozilla/firefox",
    );
    expect(profiles[0]).toEqual({
      name: "default-release",
      path: "/home/me/.mozilla/firefox/abc.default-release",
    });
  });
});
