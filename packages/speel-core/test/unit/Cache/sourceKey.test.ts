import { describe, it, expect } from "vitest";
import { listKey, sourceKey } from "../../../src/Cache/listKey.js";

describe("sourceKey", () => {
  it("is the listKey for a list handle", () => {
    const list = { kind: "title" as const, value: "Projects" };
    expect(sourceKey(list)).toBe(listKey(list));
  });
  it("namespaces a provider source by its key", () => {
    expect(sourceKey({ kind: "provider", key: "siteUsers" })).toBe(
      "provider:siteUsers",
    );
  });
  it("never collides a provider key with a list of the same name", () => {
    expect(sourceKey({ kind: "provider", key: "x" })).not.toBe(
      sourceKey({ kind: "title", value: "x" }),
    );
  });
});
