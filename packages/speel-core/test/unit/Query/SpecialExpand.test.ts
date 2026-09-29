import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  ModelConfigurationException,
  SpeelEntity,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

const GADGETS = { kind: "title", value: "Gadgets" } as const;

class Gadget extends SpeelEntity {
  Title?: string;
  // Typed surfaces for the registered handler to populate — deliberately NOT model
  // columns, exactly like the securable members this seam exists to carry.
  readonly Fancy?: unknown = undefined;
  readonly TopFlag?: boolean = undefined;
}

function registerGadget(mb: ModelBuilder): void {
  mb.entity(Gadget, (b) => {
    b.toList("Gadgets");
    b.property((e) => e.Title).isText();
  });
}

/** A synthetic handler: nested paths, a top-level select field, its own materializer. */
function fancyExpand() {
  return {
    navName: "Fancy",
    spec: () => ({
      navName: "Fancy",
      fields: [],
      expandPaths: ["Fancy/Deep"],
      selectPaths: ["Fancy/Deep", "TopFlag"],
      materialize: (
        target: Record<string, unknown>,
        record: Record<string, unknown>,
      ): void => {
        target.Fancy = record.Fancy;
        if (record.TopFlag !== undefined)
          target.TopFlag = record.TopFlag === true;
      },
    }),
  };
}

class Ctx extends DbContext {
  gadgets = this.set(Gadget);
  protected override onModelCreating(mb: ModelBuilder): void {
    registerGadget(mb);
    mb.addSpecialExpand(fancyExpand());
  }
}

async function seedGadget(provider: FakeStorageProvider): Promise<void> {
  provider.seedRow(GADGETS, { Title: "G" });
}

describe("the special-expand seam", () => {
  it("carries the handler's wire spec and runs its materializer", async () => {
    const provider = new FakeStorageProvider();
    const ctx = new Ctx({ provider });
    await seedGadget(provider);
    provider.seedExpandPayload(GADGETS, 1, "Fancy", { Deep: "treasure" });
    provider.seedItemFields(GADGETS, 1, { TopFlag: true });

    const [g] = await ctx.gadgets.expand((x) => x.Fancy).toArrayAsync();

    expect(g!.Fancy).toEqual({ Deep: "treasure" });
    expect(g!.TopFlag).toBe(true);
  });

  it("adds one clause however often the same special expand is requested", async () => {
    const provider = new FakeStorageProvider();
    const ctx = new Ctx({ provider });

    const q = ctx.gadgets
      .expand((x) => x.Fancy)
      .expand((x) => x.Fancy) as unknown as {
      state: { expands: readonly unknown[] };
    };
    expect(q.state.expands).toHaveLength(1);
  });

  it("leaves untouched entities without the expand requested", async () => {
    const provider = new FakeStorageProvider();
    const ctx = new Ctx({ provider });
    await seedGadget(provider);
    provider.seedExpandPayload(GADGETS, 1, "Fancy", { Deep: "treasure" });

    const [g] = await ctx.gadgets.toArrayAsync();
    expect(g!.Fancy).toBeUndefined();
  });

  it("refuses a cache config naming a registered special expand", () => {
    class BadCtx extends DbContext {
      gadgets = this.set(Gadget);
      protected override onModelCreating(mb: ModelBuilder): void {
        registerGadget(mb);
        mb.addSpecialExpand(fancyExpand());
        mb.entity(Gadget, (b) => b.useCaching((c) => c.expand((x) => x.Fancy)));
      }
    }
    const ctx = new BadCtx({ provider: new FakeStorageProvider() });
    expect(() => ctx.gadgets.expand((x) => x.Fancy)).toThrow(
      ModelConfigurationException,
    );
  });

  it("refuses two handlers claiming one name", () => {
    class DupCtx extends DbContext {
      gadgets = this.set(Gadget);
      protected override onModelCreating(mb: ModelBuilder): void {
        registerGadget(mb);
        mb.addSpecialExpand(fancyExpand());
        mb.addSpecialExpand(fancyExpand());
      }
    }
    const ctx = new DupCtx({ provider: new FakeStorageProvider() });
    expect(() => ctx.gadgets.expand((x) => x.Fancy)).toThrow(
      ModelConfigurationException,
    );
  });
});
