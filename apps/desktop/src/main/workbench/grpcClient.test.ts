import { createServer } from "node:net";
import { afterAll, expect, test } from "vitest";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeProto, invokeGrpc } from "./grpcClient";

const PROTO = `
syntax = "proto3";
package helloworld;
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply);
  rpc ListHellos (HelloRequest) returns (stream HelloReply);
}
message HelloRequest { string name = 1; }
message HelloReply { string message = 1; }
`;

function listenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

const dir = mkdtempSync(join(tmpdir(), "lurkwire-grpc-test-"));
const protoPath = join(dir, "hello.proto");
writeFileSync(protoPath, PROTO);
const def = protoLoader.loadSync(protoPath, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true });
const packed = grpc.loadPackageDefinition(def) as Record<string, Record<string, grpc.ServiceClientConstructor>>;
const Greeter = packed.helloworld.Greeter;

let server: grpc.Server | null = null;
let target = "";

async function start(): Promise<string> {
  if (target) {
    return target;
  }
  const port = await listenPort();
  server = new grpc.Server();
  server.addService(Greeter.service, {
    SayHello: (call: grpc.ServerUnaryCall<{ name: string }, { message: string }>, cb: grpc.sendUnaryData<{ message: string }>) => {
      cb(null, { message: `hello ${call.request.name}` });
    },
    ListHellos: (call: grpc.ServerWritableStream<{ name: string }, { message: string }>) => {
      call.write({ message: `hello ${call.request.name}` });
      call.write({ message: "again" });
      call.end();
    },
  });
  target = await new Promise<string>((resolve, reject) => {
    server!.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (error, bound) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`127.0.0.1:${bound}`);
    });
  });
  return target;
}

afterAll(async () => {
  await new Promise<void>((resolve) => (server ? server.tryShutdown(() => resolve()) : resolve()));
  rmSync(dir, { recursive: true, force: true });
});

test("parses the sample proto", () => {
  const doc = describeProto(PROTO);
  expect(doc.services[0]?.methods.map((item) => item.name)).toEqual(["SayHello", "ListHellos"]);
});

test("invokes a unary RPC on a local server", async () => {
  const address = await start();
  const result = await invokeGrpc({
    target: address,
    proto: PROTO,
    service: "helloworld.Greeter",
    method: "SayHello",
    body: JSON.stringify({ name: "lurkwire" }),
  });
  expect(result.error).toBeUndefined();
  expect(result.events.some((item) => item.dir === "in" && item.text.includes("hello lurkwire"))).toBe(true);
});

test("invokes a server-streaming RPC on a local server", async () => {
  const address = await start();
  const result = await invokeGrpc({
    target: address,
    proto: PROTO,
    service: "Greeter",
    method: "ListHellos",
    body: JSON.stringify({ name: "lab" }),
  });
  expect(result.error).toBeUndefined();
  const incoming = result.events.filter((item) => item.dir === "in");
  expect(incoming.length).toBe(2);
});
