// test/UseSharePoint.test.ts
import { describe, it, expect } from "vitest";
import type { SPFI } from "@pnp/sp";
import { DbContextOptionsBuilder } from "@speel/core";
import "../src/UseSharePoint.js"; // declaration merge

describe("UseSharePoint", () => {
  it("is callable with an explicit pre-built SPFI (advanced)", () => {
    const fakeSpi = {
      web: { lists: { getByTitle: () => null, getById: () => null } },
      batched: () => [fakeSpi, async () => undefined],
    };
    const ob = new DbContextOptionsBuilder();
    ob.useSharePoint({ spInstance: fakeSpi as unknown as SPFI });
    expect(ob.options.provider).toBeDefined();
  });

  it("builds an SPFI when given a webUrl (no spfxContext)", () => {
    const ob = new DbContextOptionsBuilder();
    ob.useSharePoint({ webUrl: "https://contoso.sharepoint.com/sites/dev" });
    expect(ob.options.provider).toBeDefined();
  });
});
