import { describe, expect, it } from "vitest";
import { alreadyPresent, appendParam, isInterestingParam, planParamProbes } from "./paramMiner";

describe("param miner", () => {
  it("appends only missing names and flags length or status changes", () => {
    const url = "https://example.com/search?q=test";
    expect(alreadyPresent(url, "q")).toBe(true);
    expect(alreadyPresent(url, "debug")).toBe(false);
    expect(appendParam(url, "debug")).toBe("https://example.com/search?q=test&debug=1");
    expect(planParamProbes(url, ["q", "debug", "admin"])).toEqual(["debug", "admin"]);
    expect(isInterestingParam({ status: 200, length: 100 }, { status: 200, length: 100 })).toBe(false);
    expect(isInterestingParam({ status: 200, length: 100 }, { status: 200, length: 140 })).toBe(true);
    expect(isInterestingParam({ status: 200, length: 100 }, { status: 403, length: 100 })).toBe(true);
  });
});
