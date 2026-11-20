export const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType { name }
    mutationType { name }
    subscriptionType { name }
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        args { name description type { ...TypeRef } defaultValue }
        type { ...TypeRef }
      }
      inputFields { name description type { ...TypeRef } defaultValue }
      interfaces { name kind }
      enumValues(includeDeprecated: true) { name description }
      possibleTypes { name kind }
    }
  }
}
fragment TypeRef on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
}
`;

export type GqlTypeRef = {
  kind: string;
  name?: string | null;
  ofType?: GqlTypeRef | null;
};

export type GqlField = {
  name: string;
  description?: string | null;
  args?: { name: string; type: GqlTypeRef }[];
  type: GqlTypeRef;
};

export type GqlType = {
  kind: string;
  name: string;
  description?: string | null;
  fields?: GqlField[] | null;
  inputFields?: GqlField[] | null;
  enumValues?: { name: string }[] | null;
  possibleTypes?: { name: string; kind: string }[] | null;
};

export type GqlSchema = {
  queryType?: { name: string } | null;
  mutationType?: { name: string } | null;
  subscriptionType?: { name: string } | null;
  types: GqlType[];
};

export function unwrapTypeName(ref: GqlTypeRef | null | undefined): string {
  if (!ref) {
    return "Unknown";
  }
  if (ref.kind === "NON_NULL") {
    return `${unwrapTypeName(ref.ofType)}!`;
  }
  if (ref.kind === "LIST") {
    return `[${unwrapTypeName(ref.ofType)}]`;
  }
  return ref.name ?? "Unknown";
}

export function parseIntrospection(data: unknown): GqlSchema {
  const root = data as { data?: { __schema?: GqlSchema }; __schema?: GqlSchema };
  const schema = root.data?.__schema ?? root.__schema;
  if (!schema?.types) {
    throw new Error("Not a GraphQL introspection result");
  }
  return schema;
}

export function visibleTypes(schema: GqlSchema): GqlType[] {
  return schema.types.filter((item) => item.name && !item.name.startsWith("__")).sort((a, b) => a.name.localeCompare(b.name));
}

export function typeByName(schema: GqlSchema, name: string): GqlType | undefined {
  return schema.types.find((item) => item.name === name);
}

export function stubOperation(schema: GqlSchema, typeName: string, field: GqlField): string {
  const root =
    schema.queryType?.name === typeName ? "query" : schema.mutationType?.name === typeName ? "mutation" : "query";
  const args = (field.args ?? []).map((arg) => `${arg.name}: ${unwrapTypeName(arg.type).endsWith("!") ? '""' : "null"}`);
  const argList = args.length ? `(${args.join(", ")})` : "";
  return `${root} {\n  ${field.name}${argList}\n}\n`;
}
