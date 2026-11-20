import { describe, expect, it } from "vitest";
import { flowTitle, highlightOf, setHighlight, tlsLabel } from "./flowMeta";

describe("flowMeta", () => {
  it("stores highlight as an hl: tag without dropping other tags", () => {
    expect(highlightOf(["keep", "hl:orange"])).toBe("orange");
    expect(setHighlight(["keep", "hl:red"], "blue")).toEqual(["keep", "hl:blue"]);
    expect(setHighlight(["keep", "hl:red"], null)).toEqual(["keep"]);
  });

  it("titles a flow from the last path segment", () => {
    expect(flowTitle("/account/login", "example.com")).toBe("login");
    expect(flowTitle("/", "example.com")).toBe("example.com");
  });

  it("labels TLS from the scheme and HTTP version", () => {
    expect(tlsLabel("https", "HTTP/1.1")).toBe("TLS · HTTP/1.1");
    expect(tlsLabel("http", "HTTP/1.1")).toBe("HTTP/1.1");
  });
});
