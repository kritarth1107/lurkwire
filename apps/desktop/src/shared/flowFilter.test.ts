import { describe, expect, test } from "vitest";
import { describeFlowFilter, escapeFtsQuery, parseFlowFilter, tokenizeFilter } from "./flowFilter";

describe("flow filter DSL", () => {
  test("tokenizes quoted phrases and bare words", () => {
    expect(tokenizeFilter('host:api "hello world" status:2xx')).toEqual([
      "host:api",
      "hello world",
      "status:2xx",
    ]);
  });

  test("parses structured keys and leaves residual text", () => {
    const filter = parseFlowFilter(
      'method:post status:5xx host:dvwa path:/vulnerabilities mime:html source:browser scheme:http scope:yes has:note login',
    );
    expect(filter).toMatchObject({
      method: "POST",
      statusMin: 500,
      statusMax: 599,
      host: "dvwa",
      path: "/vulnerabilities",
      mime: "html",
      source: "browser",
      scheme: "http",
      inScope: true,
      hasNote: true,
      fts: "login",
    });
  });

  test("understands status ranges, inequalities, and in-scope tokens", () => {
    expect(parseFlowFilter("status:401")).toMatchObject({ status: 401 });
    expect(parseFlowFilter("status:>=400")).toMatchObject({ statusMin: 400 });
    expect(parseFlowFilter("status:200-204")).toMatchObject({ statusMin: 200, statusMax: 204 });
    expect(parseFlowFilter("in-scope")).toMatchObject({ inScope: true, fts: "" });
    expect(parseFlowFilter("out-of-scope")).toMatchObject({ inScope: false, fts: "" });
  });

  test("describes a filter as chips", () => {
    const chips = describeFlowFilter(parseFlowFilter("method:GET status:2xx host:example"));
    expect(chips).toEqual(["method GET", "host example", "status 200–299"]);
  });

  test("escapes FTS operators such as slashes", () => {
    expect(escapeFtsQuery("products/search")).toBe('"products/search"');
    expect(escapeFtsQuery("login")).toBe("login");
  });
});
