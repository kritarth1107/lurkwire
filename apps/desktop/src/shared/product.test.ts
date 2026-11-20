import { describe, expect, it } from "vitest";
import { PRODUCT_NAME, PRODUCT_VERSION } from "./product";

describe("product", () => {
  it("is named Lurkwire", () => {
    expect(PRODUCT_NAME).toBe("Lurkwire");
  });

  it("exposes a semver version", () => {
    expect(PRODUCT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
