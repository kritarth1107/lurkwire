import { expect, test } from "vitest";
import { runRecipe } from "./codecRecipe";

test("chains url and base64 steps", () => {
  const encoded = runRecipe("hello world", [
    { id: "1", codec: "url", direction: "encode" },
    { id: "2", codec: "base64", direction: "encode" },
  ]);
  expect(encoded.error).toBeUndefined();
  const decoded = runRecipe(encoded.output, [
    { id: "1", codec: "base64", direction: "decode" },
    { id: "2", codec: "url", direction: "decode" },
  ]);
  expect(decoded.output).toBe("hello world");
});
