import { expect, test } from "vitest";
import { expandWordlist, isInterestingStatus, joinPath, parseWordlist } from "./discover";

test("joins words onto a base URL", () => {
  expect(joinPath("https://example.com/app", "admin")).toBe("https://example.com/app/admin");
  expect(joinPath("https://example.com", "/graphql")).toBe("https://example.com/graphql");
});

test("expands extensions and parses lists", () => {
  expect(expandWordlist(["admin", "app.js"], [".bak", ".json"])).toEqual(["admin", "admin.bak", "admin.json", "app.js"]);
  expect(parseWordlist("# comment\n/admin\n\nlogin\n")).toEqual(["admin", "login"]);
});

test("interesting statuses include 200, 401, and 500", () => {
  expect(isInterestingStatus(200)).toBe(true);
  expect(isInterestingStatus(404)).toBe(false);
  expect(isInterestingStatus(401)).toBe(true);
  expect(isInterestingStatus(500)).toBe(true);
});
