// test/getSPFI.test.ts
import { describe, it, expect } from "vitest";
import type { SPFI } from "@pnp/sp";
import type { DbContext } from "@speel/core";
import { SharePointProvider } from "../src/SharePointProvider.js";
import { getSPFI } from "../src/getSPFI.js";

describe("getSPFI", () => {
  it("returns the SPFI behind a SharePoint-backed context", () => {
    const sp = { web: {} } as unknown as SPFI;
    const ctx = {
      provider: new SharePointProvider(sp),
    } as unknown as DbContext;
    expect(getSPFI(ctx)).toBe(sp);
  });

  it("throws for a context not backed by SharePointProvider", () => {
    const ctx = { provider: {} } as unknown as DbContext;
    expect(() => getSPFI(ctx)).toThrow(/not backed by a SharePointProvider/);
  });
});
