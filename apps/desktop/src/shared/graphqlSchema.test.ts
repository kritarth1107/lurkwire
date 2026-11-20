import { expect, test } from "vitest";
import { parseIntrospection, stubOperation, unwrapTypeName, visibleTypes } from "./graphqlSchema";

const data = {
  data: {
    __schema: {
      queryType: { name: "Query" },
      mutationType: { name: "Mutation" },
      types: [
        {
          kind: "OBJECT",
          name: "Query",
          fields: [
            {
              name: "user",
              args: [{ name: "id", type: { kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } } }],
              type: { kind: "OBJECT", name: "User" },
            },
          ],
        },
        { kind: "OBJECT", name: "User", fields: [{ name: "id", args: [], type: { kind: "SCALAR", name: "ID" } }] },
        { kind: "OBJECT", name: "__Schema", fields: [] },
      ],
    },
  },
};

test("parses introspection and hides meta types", () => {
  const schema = parseIntrospection(data);
  expect(visibleTypes(schema).map((item) => item.name)).toEqual(["Query", "User"]);
  expect(unwrapTypeName({ kind: "NON_NULL", ofType: { kind: "SCALAR", name: "ID" } })).toBe("ID!");
  expect(stubOperation(schema, "Query", schema.types[0].fields![0])).toContain("query");
});
