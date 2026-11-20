import { expect, test } from "vitest";
import { endpointsOf, extractJsFindings, isHighConfidence, secretsOf } from "./jsSecrets";

const sample = `
const API = "https://api.example.com/v1/users";
fetch("/graphql", { headers: { Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.abcabcabcabc" } });
const aws = "AKIAIOSFODNN7EXAMPLE";
const secret = { api_key: "supersecretvalue1" };
`;

test("extracts URLs, JWTs, AWS keys, and generic secrets", () => {
  const items = extractJsFindings(sample);
  expect(endpointsOf(items)).toEqual(expect.arrayContaining(["https://api.example.com/v1/users", "/graphql"]));
  const kinds = secretsOf(items).map((item) => item.kind);
  expect(kinds).toEqual(expect.arrayContaining(["jwt", "awsAccessKey", "generic"]));
});

test("treats AWS keys and JWTs as high confidence, not generic secrets", () => {
  const items = extractJsFindings(sample);
  expect(items.some((item) => item.kind === "awsAccessKey" && isHighConfidence(item.kind))).toBe(true);
  expect(isHighConfidence("generic")).toBe(false);
  expect(isHighConfidence("endpoint")).toBe(false);
});
