import { decodeCodec, encodeCodec, type CodecId } from "./codec";

export type RecipeStep = {
  id: string;
  codec: CodecId;
  direction: "encode" | "decode";
};

export type RecipeResult = {
  output: string;
  error?: string;
  step?: number;
};

export function runRecipe(input: string, steps: RecipeStep[]): RecipeResult {
  let output = input;
  for (const [index, step] of steps.entries()) {
    try {
      output = step.direction === "decode" ? decodeCodec(step.codec, output) : encodeCodec(step.codec, output);
    } catch (error) {
      return { output, error: error instanceof Error ? error.message : String(error), step: index };
    }
  }
  return { output };
}
