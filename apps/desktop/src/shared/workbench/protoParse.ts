export type ProtoRpc = {
  name: string;
  requestType: string;
  responseType: string;
  clientStreaming: boolean;
  serverStreaming: boolean;
};

export type ProtoService = {
  name: string;
  package: string;
  fullName: string;
  methods: ProtoRpc[];
};

export type ProtoMessage = {
  name: string;
  fullName: string;
  fields: { name: string; type: string; repeated: boolean }[];
};

export type ProtoDocument = {
  package: string;
  services: ProtoService[];
  messages: ProtoMessage[];
};

function stripComments(input: string): string {
  return input.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

export function parseProto(input: string): ProtoDocument {
  const text = stripComments(input);
  const pkg = text.match(/\bpackage\s+([\w.]+)\s*;/)?.[1] ?? "";
  const qualify = (name: string) => (name.includes(".") ? name : pkg ? `${pkg}.${name}` : name);
  const messages: ProtoMessage[] = [];
  const messageRe = /\bmessage\s+(\w+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = messageRe.exec(text))) {
    const fields: ProtoMessage["fields"] = [];
    const fieldRe = /\b(?:repeated\s+)?(?:optional\s+)?(?:required\s+)?([\w.]+)\s+(\w+)\s*=\s*\d+/g;
    let field: RegExpExecArray | null;
    const body = match[2];
    while ((field = fieldRe.exec(body))) {
      fields.push({
        name: field[2],
        type: field[1],
        repeated: /(?:^|\s)repeated\s+/.test(field[0]),
      });
    }
    messages.push({ name: match[1], fullName: qualify(match[1]), fields });
  }
  const services: ProtoService[] = [];
  const serviceRe = /\bservice\s+(\w+)\s*\{([^{}]*)\}/g;
  while ((match = serviceRe.exec(text))) {
    const methods: ProtoRpc[] = [];
    const rpcRe =
      /\brpc\s+(\w+)\s*\(\s*(stream\s+)?([\w.]+)\s*\)\s*returns\s*\(\s*(stream\s+)?([\w.]+)\s*\)/g;
    let rpc: RegExpExecArray | null;
    const body = match[2];
    while ((rpc = rpcRe.exec(body))) {
      methods.push({
        name: rpc[1],
        requestType: rpc[3],
        responseType: rpc[5],
        clientStreaming: Boolean(rpc[2]),
        serverStreaming: Boolean(rpc[4]),
      });
    }
    services.push({ name: match[1], package: pkg, fullName: qualify(match[1]), methods });
  }
  return { package: pkg, services, messages };
}

export function stubJson(doc: ProtoDocument, typeName: string): string {
  const bare = typeName.includes(".") ? typeName.split(".").pop()! : typeName;
  const message = doc.messages.find((item) => item.name === bare || item.fullName === typeName);
  if (!message) {
    return "{\n}\n";
  }
  const scalars: Record<string, unknown> = {
    string: "",
    bytes: "",
    bool: false,
    int32: 0,
    int64: "0",
    uint32: 0,
    uint64: "0",
    sint32: 0,
    sint64: "0",
    fixed32: 0,
    fixed64: "0",
    sfixed32: 0,
    sfixed64: "0",
    float: 0,
    double: 0,
  };
  const obj: Record<string, unknown> = {};
  for (const field of message.fields) {
    const value = Object.prototype.hasOwnProperty.call(scalars, field.type) ? scalars[field.type] : {};
    obj[field.name] = field.repeated ? [] : value;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function parseGrpcTarget(input: string): { host: string; port: number; tls: boolean; authority: string } {
  const trimmed = input.trim();
  const withScheme = trimmed.includes("://") ? trimmed : `grpc://${trimmed}`;
  const url = new URL(withScheme);
  const tls = url.protocol === "https:" || url.protocol === "grpcs:";
  const port = url.port ? Number(url.port) : tls ? 443 : url.protocol === "http:" ? 80 : 50051;
  const host = url.hostname || "127.0.0.1";
  return { host, port, tls, authority: `${host}:${port}` };
}
