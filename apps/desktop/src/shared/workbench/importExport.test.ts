import { describe, expect, it } from "vitest";
import {
  exportPostmanCollection,
  importAny,
  importHar,
  importOpenApi,
  importPostman,
} from "./importExport";

const postman = {
  info: {
    name: "Demo",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [{ key: "base", value: "https://httpbin.org" }],
  item: [
    {
      name: "Echo",
      item: [
        {
          name: "Get headers",
          request: {
            method: "GET",
            header: [{ key: "Accept", value: "application/json" }],
            url: { raw: "{{base}}/headers", host: ["{{base}}"], path: ["headers"] },
          },
          event: [
            {
              listen: "test",
              script: { exec: ['pm.test("ok", function () { pm.response.to.have.status(200); });'] },
            },
          ],
        },
        {
          name: "Post json",
          request: {
            method: "POST",
            header: [],
            url: "https://httpbin.org/post",
            body: { mode: "raw", raw: '{"a":1}', options: { raw: { language: "json" } } },
            auth: { type: "bearer", bearer: [{ key: "token", value: "abc" }] },
          },
        },
      ],
    },
  ],
};

describe("importPostman and export", () => {
  it("imports folders, variables, auth, body, and tests", () => {
    const result = importPostman(postman);
    expect(result.source).toBe("postman");
    expect(result.collections[0]?.name).toBe("Demo");
    expect(result.collections[0]?.variables[0]?.value).toBe("https://httpbin.org");
    expect(result.folders[0]?.name).toBe("Echo");
    expect(result.requests).toHaveLength(2);
    const get = result.requests.find((r) => r.name === "Get headers");
    expect(get?.url).toBe("{{base}}/headers");
    expect(get?.testScript).toContain("pm.response.to.have.status");
    const post = result.requests.find((r) => r.name === "Post json");
    expect(post?.body.mode).toBe("json");
    expect(post?.auth.type).toBe("bearer");
    const exported = exportPostmanCollection(result.collections[0]!, result.folders, result.requests);
    const round = importPostman(exported);
    expect(round.requests.map((r) => r.name).sort()).toEqual(["Get headers", "Post json"]);
  });
});

describe("importOpenApi", () => {
  it("creates requests and folders from paths and tags", () => {
    const result = importOpenApi({
      openapi: "3.0.0",
      info: { title: "httpbin", version: "1" },
      servers: [{ url: "https://httpbin.org" }],
      paths: {
        "/get": {
          get: { operationId: "getGet", tags: ["HTTP methods"], summary: "GET echo" },
        },
        "/post": {
          post: {
            tags: ["HTTP methods"],
            requestBody: { content: { "application/json": { example: { foo: "bar" } } } },
          },
        },
        "/pets/{id}": {
          get: { parameters: [{ name: "id", in: "path", example: "1" }], tags: ["Pets"] },
        },
      },
    });
    expect(result.source).toBe("openapi");
    expect(result.collections[0]?.variables[0]?.value).toBe("https://httpbin.org");
    expect(result.folders.map((f) => f.name).sort()).toEqual(["HTTP methods", "Pets"]);
    expect(result.requests).toHaveLength(3);
    const pet = result.requests.find((r) => r.url.includes("pets"));
    expect(pet?.url).toBe("{{baseUrl}}/pets/1");
    const post = result.requests.find((r) => r.method === "POST");
    expect(post?.body.mode).toBe("json");
    expect(post?.body.json).toContain("foo");
  });
});

describe("importHar and importAny", () => {
  it("imports HAR entries and auto-detects format", () => {
    const har = {
      log: {
        creator: { name: "test", version: "1" },
        entries: [
          {
            request: {
              method: "POST",
              url: "https://httpbin.org/post?x=1",
              headers: [{ name: "Content-Type", value: "application/json" }],
              postData: { mimeType: "application/json", text: '{"z":2}' },
            },
          },
        ],
      },
    };
    const result = importHar(har);
    expect(result.requests[0]?.method).toBe("POST");
    expect(result.requests[0]?.params[0]).toMatchObject({ key: "x", value: "1" });
    expect(result.requests[0]?.body.mode).toBe("json");
    const viaAny = importAny(JSON.stringify(postman));
    expect(viaAny.source).toBe("postman");
    const curl = importAny(`curl -X GET https://example.com/ -H 'Accept: text/html'`);
    expect(curl.source).toBe("curl");
    expect(curl.requests[0]?.url).toBe("https://example.com/");
  });
});

const yamlSpec = `
openapi: "3.0.0"
info:
  title: YAML Petstore
  version: "1.0.0"
servers:
  - url: https://httpbin.org
paths:
  /get:
    get:
      operationId: getStatus
      summary: Status
      responses:
        "200":
          description: ok
  /post:
    post:
      tags:
        - write
      summary: Echo
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        "200":
          description: ok
`.trim();

it("imports OpenAPI 3 YAML", () => {
  const result = importAny(yamlSpec, "petstore.yaml");
  expect(result.source).toBe("openapi");
  expect(result.collections[0]?.name).toBe("YAML Petstore");
  expect(result.requests.map((item) => item.method).sort()).toEqual(["GET", "POST"]);
  expect(result.requests.some((item) => item.url.includes("/get"))).toBe(true);
});
