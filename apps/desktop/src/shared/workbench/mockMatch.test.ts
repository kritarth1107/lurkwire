import { expect, test } from "vitest";
import { emptyAuth, emptyBody, type WbRequest } from "./types";
import { matchMockRequest, mockReplyFor, pathToRegex } from "./mockMatch";

function req(method: string, url: string, name = "r"): WbRequest {
  return {
    id: name,
    name,
    method,
    url,
    params: [],
    headers: [],
    body: emptyBody(),
    auth: emptyAuth(),
    collectionId: "c",
    folderId: null,
    updatedAt: 0,
  };
}

test("matches literal and templated paths", () => {
  expect(pathToRegex("{{baseUrl}}/users/{{id}}").test("/users/42")).toBe(true);
  const hit = matchMockRequest({ method: "GET", pathname: "/users/42" }, [req("GET", "{{baseUrl}}/users/{{id}}")]);
  expect(hit?.id).toBe("r");
});

test("uses an explicit mock body when present", () => {
  const request = { ...req("GET", "/ping"), mock: { status: 418, headers: [], body: "teapot" } };
  expect(mockReplyFor(request, "x")).toEqual({ status: 418, headers: [], body: "teapot" });
});
