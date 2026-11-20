import { expect, test } from "vitest";
import { parseIntrospection } from "./graphqlSchema";
import { buildSchemaGraph } from "./graphqlGraph";

const data = {
  data: {
    __schema: {
      queryType: { name: "Query" },
      types: [
        {
          kind: "OBJECT",
          name: "Query",
          fields: [
            { name: "user", args: [], type: { kind: "OBJECT", name: "User" } },
            { name: "users", args: [], type: { kind: "LIST", ofType: { kind: "OBJECT", name: "User" } } },
          ],
        },
        {
          kind: "OBJECT",
          name: "User",
          fields: [
            { name: "id", args: [], type: { kind: "SCALAR", name: "ID" } },
            { name: "team", args: [], type: { kind: "OBJECT", name: "Team" } },
          ],
        },
        { kind: "OBJECT", name: "Team", fields: [{ name: "name", args: [], type: { kind: "SCALAR", name: "String" } }] },
        { kind: "SCALAR", name: "ID" },
        { kind: "SCALAR", name: "String" },
        { kind: "OBJECT", name: "__Schema", fields: [] },
      ],
    },
  },
};

test("layouts a Query -> User -> Team graph", () => {
  const graph = buildSchemaGraph(parseIntrospection(data));
  const ids = graph.nodes.map((item) => item.id);
  expect(ids).toEqual(expect.arrayContaining(["Query", "User", "Team"]));
  expect(graph.edges).toEqual(
    expect.arrayContaining([
      { from: "Query", to: "User", field: "user" },
      { from: "User", to: "Team", field: "team" },
    ]),
  );
  const query = graph.nodes.find((item) => item.id === "Query")!;
  const user = graph.nodes.find((item) => item.id === "User")!;
  expect(user.x).toBeGreaterThan(query.x);
});
