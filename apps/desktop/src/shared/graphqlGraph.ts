import { unwrapTypeName, visibleTypes, type GqlSchema, type GqlType } from "./graphqlSchema";

export type GraphNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
};

export type GraphEdge = {
  from: string;
  to: string;
  field: string;
};

export type SchemaGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
};

function namedType(ref: { kind: string; name?: string | null; ofType?: unknown } | null | undefined): string | null {
  const label = unwrapTypeName(ref as never).replace(/[!\[\]]/g, "");
  return label && label !== "Unknown" ? label : null;
}

export function buildSchemaGraph(schema: GqlSchema): SchemaGraph {
  const types = visibleTypes(schema);
  const byName = new Map(types.map((item) => [item.name, item]));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const walkFields = (type: GqlType) => {
    for (const field of [...(type.fields ?? []), ...(type.inputFields ?? [])]) {
      const target = namedType(field.type);
      if (!target || !byName.has(target) || target === type.name) {
        continue;
      }
      const key = `${type.name}->${target}:${field.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push({ from: type.name, to: target, field: field.name });
    }
  };
  for (const type of types) {
    walkFields(type);
  }
  const roots = [schema.queryType?.name, schema.mutationType?.name, schema.subscriptionType?.name].filter(
    (name): name is string => Boolean(name && byName.has(name)),
  );
  const level = new Map<string, number>();
  const queue = [...roots];
  for (const root of roots) {
    level.set(root, 0);
  }
  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.from !== current) {
        continue;
      }
      if (!level.has(edge.to)) {
        level.set(edge.to, (level.get(current) ?? 0) + 1);
        queue.push(edge.to);
      }
    }
  }
  let extra = (roots.length ? Math.max(...level.values()) : 0) + 1;
  for (const type of types) {
    if (!level.has(type.name)) {
      level.set(type.name, extra);
      extra += 1;
    }
  }
  const columns = new Map<number, string[]>();
  for (const type of types) {
    const depth = level.get(type.name) ?? 0;
    const list = columns.get(depth) ?? [];
    list.push(type.name);
    columns.set(depth, list);
  }
  const colWidth = 220;
  const rowHeight = 56;
  const nodes: GraphNode[] = [];
  for (const [depth, names] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    names.sort((a, b) => a.localeCompare(b));
    names.forEach((name, index) => {
      const kind = byName.get(name)?.kind ?? "OBJECT";
      nodes.push({ id: name, kind, x: 40 + depth * colWidth, y: 40 + index * rowHeight });
    });
  }
  const width = Math.max(640, 80 + (columns.size + 1) * colWidth);
  const height = Math.max(320, 80 + Math.max(0, ...[...columns.values()].map((list) => list.length)) * rowHeight);
  return { nodes, edges, width, height };
}
