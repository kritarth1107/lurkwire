import { describe, expect, it } from "vitest";
import { applyAuth, encodeBasic } from "./auth";
import { kv } from "./kv";
import { buildHttpRequest, buildUrl, requestFromFlow } from "./request";
import { emptyAuth, emptyBody } from "./types";
import type { FlowDetail } from "../types";

describe("buildUrl and auth", () => {
  it("appends enabled params and skips disabled ones", () => {
    expect(buildUrl("https://httpbin.org/get", [kv("a", "1"), kv("b", "2", false)])).toBe(
      "https://httpbin.org/get?a=1",
    );
  });

  it("applies bearer, basic, and API key auth", () => {
    const bearer = applyAuth({ type: "bearer", bearer: { token: "t" } }, [], "https://x");
    expect(bearer.headers[0]).toMatchObject({ key: "Authorization", value: "Bearer t" });
    const basic = applyAuth({ type: "basic", basic: { username: "a", password: "b" } }, [], "https://x");
    expect(basic.headers[0]?.value).toBe(`Basic ${encodeBasic("a", "b")}`);
    const query = applyAuth(
      { type: "apikey", apikey: { key: "api_key", value: "secret", addTo: "query" } },
      [],
      "https://example.com/v1",
    );
    expect(query.url).toBe("https://example.com/v1?api_key=secret");
  });
});

describe("buildHttpRequest", () => {
  it("builds a JSON POST and inherits collection auth", () => {
    const built = buildHttpRequest(
      {
        method: "POST",
        url: "https://httpbin.org/post",
        params: [],
        headers: [],
        body: { ...emptyBody(), mode: "json", json: '{"ok":true}' },
        auth: emptyAuth("inherit"),
      },
      { type: "bearer", bearer: { token: "inherited" } },
    );
    expect(built.method).toBe("POST");
    expect(built.headers.find((h) => h.name === "Authorization")?.value).toBe("Bearer inherited");
    expect(built.headers.find((h) => h.name === "Content-Type")?.value).toBe("application/json");
    expect(built.body).toBe('{"ok":true}');
  });

  it("encodes urlencoded bodies and GraphQL as JSON", () => {
    const form = buildHttpRequest({
      method: "POST",
      url: "https://httpbin.org/post",
      params: [],
      headers: [],
      body: { ...emptyBody(), mode: "urlencoded", urlencoded: [kv("a", "b c")] },
      auth: emptyAuth("none"),
    });
    expect(form.body).toBe("a=b%20c");
    const gql = buildHttpRequest({
      method: "POST",
      url: "https://example.com/graphql",
      params: [],
      headers: [],
      body: { ...emptyBody(), mode: "graphql", graphql: { query: "{ ping }", variables: '{"x":1}' } },
      auth: emptyAuth("none"),
    });
    expect(JSON.parse(gql.body ?? "")).toEqual({ query: "{ ping }", variables: { x: 1 } });
  });
});

describe("requestFromFlow", () => {
  it("splits query params and drops hop-by-hop headers", () => {
    const flow = {
      method: "GET",
      url: "https://httpbin.org/get?foo=bar",
      path: "/get",
      query: "foo=bar",
      note: "",
      req_headers: [
        { name: "Host", value: "httpbin.org" },
        { name: "Accept", value: "application/json" },
        { name: "Content-Length", value: "0" },
      ],
    } as FlowDetail;
    const req = requestFromFlow(flow);
    expect(req.url).toBe("https://httpbin.org/get");
    expect(req.params[0]).toMatchObject({ key: "foo", value: "bar" });
    expect(req.headers.map((h) => h.key)).toEqual(["Accept"]);
  });
});
