import { describe, it, expect } from "vitest";
import { tokenToEpochMs, tokenToIso } from "../../../src/Cache/changeToken.js";
import { listKey } from "../../../src/Cache/listKey.js";

describe("listKey", () => {
  it("keys by kind and value", () => {
    expect(listKey({ kind: "title", value: "Projects" })).toBe(
      "title:Projects",
    );
    expect(listKey({ kind: "id", value: "abc-123" })).toBe("id:abc-123");
  });
});

describe("changeToken", () => {
  // 2024-01-01T00:00:00Z == 638396640000000000 .NET ticks.
  const TOKEN = "1;3;b9d3...;638396640000000000;512";

  it("tokenToEpochMs parses the ticks segment to epoch ms", () => {
    expect(tokenToEpochMs(TOKEN)).toBe(Date.UTC(2024, 0, 1, 0, 0, 0));
  });

  it("tokenToEpochMs returns undefined for empty/garbage tokens", () => {
    expect(tokenToEpochMs(undefined)).toBeUndefined();
    expect(tokenToEpochMs("")).toBeUndefined();
    expect(tokenToEpochMs("1;3;guid")).toBeUndefined();
    expect(tokenToEpochMs("1;3;guid;notanumber;9")).toBeUndefined();
  });

  it("tokenToIso renders an ISO-8601 UTC string", () => {
    expect(tokenToIso(TOKEN)).toBe("2024-01-01T00:00:00.000Z");
  });

  it("tokenToIso returns undefined when ticks are unparseable", () => {
    expect(tokenToIso("")).toBeUndefined();
  });
});
