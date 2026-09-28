import { describe, it, expect } from "vitest";
import { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";

class U {
  Id?: number;
  Title?: string;
}

describe("EntityTypeBuilder provider sources", () => {
  it("toProviderSource builds a provider-source EntityType carrying the key", () => {
    const eb = new EntityTypeBuilder<U>(U);
    eb.toProviderSource({ kind: "provider", key: "siteUsers" });
    eb.property((u) => u.Title).isText();
    const et = eb.build();
    expect(et.source).toEqual({ kind: "provider", key: "siteUsers" });
    expect(et.sourceHandle).toEqual({ kind: "provider", key: "siteUsers" });
  });

  it("a provider source needs no columns beyond the key", () => {
    const eb = new EntityTypeBuilder<U>(U);
    eb.toProviderSource({ kind: "provider", key: "principals" });
    const et = eb.build();
    expect(et.source.kind).toBe("provider");
  });

  it("build without any source throws", () => {
    const eb = new EntityTypeBuilder<U>(U);
    expect(() => eb.build()).toThrow();
  });
});
