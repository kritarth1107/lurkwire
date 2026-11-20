import { expect, test } from "vitest";
import { parseGrpcTarget, parseProto, stubJson } from "./protoParse";

const sample = `
syntax = "proto3";
package helloworld;
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc ListHellos (HelloRequest) returns (stream HelloReply);
  rpc Chat (stream HelloRequest) returns (stream HelloReply);
}
message HelloRequest { string name = 1; repeated string tags = 2; }
message HelloReply { string message = 1; }
`;

test("parses services, streaming flags, and message stubs", () => {
  const doc = parseProto(sample);
  expect(doc.package).toBe("helloworld");
  expect(doc.services[0]?.fullName).toBe("helloworld.Greeter");
  expect(doc.services[0]?.methods.map((item) => [item.name, item.clientStreaming, item.serverStreaming])).toEqual([
    ["SayHello", false, false],
    ["ListHellos", false, true],
    ["Chat", true, true],
  ]);
  expect(JSON.parse(stubJson(doc, "HelloRequest"))).toEqual({ name: "", tags: [] });
});

test("parses grpc targets and default ports", () => {
  expect(parseGrpcTarget("localhost:50051")).toEqual({ host: "localhost", port: 50051, tls: false, authority: "localhost:50051" });
  expect(parseGrpcTarget("grpcs://api.example.com").tls).toBe(true);
  expect(parseGrpcTarget("grpcs://api.example.com").port).toBe(443);
});
