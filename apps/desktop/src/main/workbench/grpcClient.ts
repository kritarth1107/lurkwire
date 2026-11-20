import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { parseGrpcTarget, parseProto, type ProtoDocument, type ProtoRpc, type ProtoService } from "../../shared/workbench/protoParse";

export type GrpcCallMode = "unary" | "serverStreaming";

export type GrpcInvokeInput = {
  target: string;
  proto: string;
  service: string;
  method: string;
  body: string;
  metadata?: { name: string; value: string }[];
  deadlineMs?: number;
};

export type GrpcEvent = {
  dir: "in" | "out" | "sys";
  text: string;
};

export type GrpcInvokeResult = {
  events: GrpcEvent[];
  error?: string;
};

const REFLECTION_PROTO = `syntax = "proto3";
package grpc.reflection.v1alpha;
service ServerReflection {
  rpc ServerReflectionInfo(stream ServerReflectionRequest) returns (stream ServerReflectionResponse);
}
message ServerReflectionRequest {
  string host = 1;
  oneof message_request {
    string file_by_filename = 3;
    string file_containing_symbol = 4;
    string list_services = 7;
  }
}
message ServerReflectionResponse {
  string valid_host = 1;
  oneof message_response {
    FileDescriptorResponse file_descriptor_response = 4;
    ListServiceResponse list_services_response = 6;
    ErrorResponse error_response = 7;
  }
}
message FileDescriptorResponse { repeated bytes file_descriptor_proto = 1; }
message ListServiceResponse { repeated ServiceResponse service = 1; }
message ServiceResponse { string name = 1; }
message ErrorResponse { int32 error_code = 1; string error_message = 2; }
`;

function withTempProto(source: string, run: (path: string) => unknown): unknown {
  const dir = mkdtempSync(join(tmpdir(), "lurkwire-proto-"));
  const path = join(dir, "service.proto");
  writeFileSync(path, source);
  try {
    return run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function credentialsFor(tls: boolean): grpc.ChannelCredentials {
  return tls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
}

function loadDefinition(proto: string): grpc.GrpcObject {
  const def = withTempProto(proto, (path) =>
    protoLoader.loadSync(path, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    }),
  ) as protoLoader.PackageDefinition;
  return grpc.loadPackageDefinition(def);
}

function lookupService(root: grpc.GrpcObject, fullName: string): grpc.ServiceClientConstructor {
  const parts = fullName.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as object)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new Error(`Service ${fullName} was not found in the proto.`);
    }
  }
  if (typeof current !== "function") {
    throw new Error(`Service ${fullName} is not a gRPC client constructor.`);
  }
  return current as grpc.ServiceClientConstructor;
}

function metadataOf(pairs?: { name: string; value: string }[]): grpc.Metadata {
  const meta = new grpc.Metadata();
  for (const item of pairs ?? []) {
    if (item.name) {
      meta.set(item.name, item.value);
    }
  }
  return meta;
}

function findMethod(doc: ProtoDocument, service: string, method: string): { service: ProtoService; rpc: ProtoRpc } {
  const svc = doc.services.find((item) => item.name === service || item.fullName === service);
  const rpc = svc?.methods.find((item) => item.name === method);
  if (!svc || !rpc) {
    throw new Error(`Unknown method ${service}/${method}.`);
  }
  return { service: svc, rpc };
}

export function describeProto(proto: string): ProtoDocument {
  return parseProto(proto);
}

function fileDescriptorSet(files: Buffer[]): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    let length = file.byteLength;
    const len: number[] = [];
    while (length > 0x7f) {
      len.push((length & 0x7f) | 0x80);
      length >>= 7;
    }
    len.push(length);
    chunks.push(Buffer.from([0x0a, ...len]), file);
  }
  return Buffer.concat(chunks);
}

export async function reflectProto(target: string): Promise<string> {
  const parsed = parseGrpcTarget(target);
  const def = withTempProto(REFLECTION_PROTO, (path) =>
    protoLoader.loadSync(path, { keepCase: true, longs: String, enums: String, defaults: true, oneofs: true }),
  ) as protoLoader.PackageDefinition;
  const packed = grpc.loadPackageDefinition(def) as Record<string, unknown>;
  const ns = packed.grpc as Record<string, unknown>;
  const alpha = (ns.reflection as Record<string, unknown>).v1alpha as Record<string, unknown>;
  const Ctor = alpha.ServerReflection as grpc.ServiceClientConstructor;
  const client = new Ctor(parsed.authority, credentialsFor(parsed.tls));
  try {
    const services = await new Promise<string[]>((resolve, reject) => {
      const call = (client as unknown as { ServerReflectionInfo: () => grpc.ClientDuplexStream<Record<string, unknown>, Record<string, unknown>> }).ServerReflectionInfo();
      const timer = setTimeout(() => reject(new Error("Reflection timed out.")), 8_000);
      call.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      call.on("data", (message) => {
        clearTimeout(timer);
        const err = message.error_response as { error_message?: string } | undefined;
        if (err?.error_message) {
          reject(new Error(err.error_message));
          return;
        }
        const list = message.list_services_response as { service?: { name: string }[] } | undefined;
        resolve((list?.service ?? []).map((item) => item.name).filter(Boolean));
        call.end();
      });
      call.write({ list_services: "*" });
    });
    const descriptors: Buffer[] = [];
    for (const symbol of services) {
      const files = await new Promise<Buffer[]>((resolve, reject) => {
        const call = (client as unknown as { ServerReflectionInfo: () => grpc.ClientDuplexStream<Record<string, unknown>, Record<string, unknown>> }).ServerReflectionInfo();
        const timer = setTimeout(() => reject(new Error(`Reflection of ${symbol} timed out.`)), 8_000);
        call.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        call.on("data", (message) => {
          clearTimeout(timer);
          const err = message.error_response as { error_message?: string } | undefined;
          if (err?.error_message) {
            reject(new Error(err.error_message));
            return;
          }
          const raw = (message.file_descriptor_response as { file_descriptor_proto?: Uint8Array[] } | undefined)?.file_descriptor_proto ?? [];
          resolve(raw.map((item) => Buffer.from(item)));
          call.end();
        });
        call.write({ file_containing_symbol: symbol });
      });
      descriptors.push(...files);
    }
    if (!descriptors.length) {
      throw new Error("The server advertised no services over reflection.");
    }
    const unique = [...new Map(descriptors.map((item) => [item.toString("base64"), item])).values()];
    const set = fileDescriptorSet(unique);
    const packageDef = protoLoader.loadFileDescriptorSetFromBuffer(set, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    // We cannot easily reconstruct source proto from descriptors for the editor,
    // so return a generated stub that lists services from reflection + original symbols.
    const lines = ['syntax = "proto3";', "", "// Reconstructed from server reflection. Upload a .proto to edit messages."];
    for (const name of services) {
      const short = name.split(".").pop() ?? name;
      const pkg = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : "";
      if (pkg) {
        lines.push(`package ${pkg};`);
      }
      lines.push(`service ${short} {`);
      const obj = grpc.loadPackageDefinition(packageDef);
      const CtorService = lookupService(obj, name);
      const methods = (CtorService as unknown as { service: Record<string, { originalName?: string; requestStream?: boolean; responseStream?: boolean; path: string }> }).service ?? {};
      for (const method of Object.values(methods)) {
        const rpcName = method.originalName ?? method.path.split("/").pop() ?? "Method";
        const req = method.requestStream ? "stream bytes" : "bytes";
        const res = method.responseStream ? "stream bytes" : "bytes";
        lines.push(`  rpc ${rpcName} (${req}) returns (${res});`);
      }
      lines.push("}", "");
    }
    return lines.join("\n");
  } finally {
    client.close();
  }
}

export async function invokeGrpc(input: GrpcInvokeInput, onEvent?: (event: GrpcEvent) => void): Promise<GrpcInvokeResult> {
  const events: GrpcEvent[] = [];
  const push = (event: GrpcEvent) => {
    events.push(event);
    onEvent?.(event);
  };
  try {
    const doc = parseProto(input.proto);
    const { service, rpc } = findMethod(doc, input.service, input.method);
    if (rpc.clientStreaming) {
      throw new Error("Client-streaming and bidirectional RPCs are not supported yet. Use unary or server-streaming.");
    }
    let payload: unknown = {};
    if (input.body.trim()) {
      payload = JSON.parse(input.body) as unknown;
    }
    const parsed = parseGrpcTarget(input.target);
    const root = loadDefinition(input.proto);
    const Ctor = lookupService(root, service.fullName);
    const client = new Ctor(parsed.authority, credentialsFor(parsed.tls));
    const methodName = rpc.name[0]!.toLowerCase() + rpc.name.slice(1);
    const fn = (client as unknown as Record<string, unknown>)[methodName];
    if (typeof fn !== "function") {
      client.close();
      throw new Error(`The loaded client has no method ${methodName}.`);
    }
    push({ dir: "out", text: JSON.stringify(payload, null, 2) });
    const deadline = new Date(Date.now() + (input.deadlineMs ?? 15_000));
    const meta = metadataOf(input.metadata);
    if (!rpc.serverStreaming) {
      await new Promise<void>((resolve, reject) => {
        (fn as Function).call(client, payload, meta, { deadline }, (error: grpc.ServiceError | null, response: unknown) => {
          client.close();
          if (error) {
            reject(error);
            return;
          }
          push({ dir: "in", text: JSON.stringify(response, null, 2) });
          resolve();
        });
      });
    } else {
      await new Promise<void>((resolve, reject) => {
        const call = (fn as Function).call(client, payload, meta, { deadline }) as grpc.ClientReadableStream<unknown>;
        call.on("data", (message) => push({ dir: "in", text: JSON.stringify(message, null, 2) }));
        call.on("error", (error) => {
          client.close();
          reject(error);
        });
        call.on("end", () => {
          client.close();
          push({ dir: "sys", text: "Stream ended" });
          resolve();
        });
      });
    }
    return { events };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    push({ dir: "sys", text: message });
    return { events, error: message };
  }
}
