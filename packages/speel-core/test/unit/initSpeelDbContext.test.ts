// test/unit/initSpeelDbContext.test.ts
import { describe, it, expect } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { initSpeelDbContext } from "../../src/initSpeelDbContext.js";
import { DbSet } from "../../src/DbSet.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../src/errors.js";

class Blog {
  Id?: number;
  Title?: string;
}

class TestCtx extends DbContext {
  public blogs = this.set(Blog);
  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
    });
  }
}

describe("initSpeelDbContext", () => {
  it("builds and returns a plain instance of the passed class (not a Proxy)", () => {
    const ctx = initSpeelDbContext(TestCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(ctx).toBeInstanceOf(TestCtx);
    expect(ctx.constructor).toBe(TestCtx);
    expect(ctx.blogs).toBeInstanceOf(DbSet);
    // Reading an unknown property is plain undefined — no get-trap side effects.
    expect((ctx as unknown as Record<string, unknown>).nope).toBeUndefined();
  });

  it("wires the provider configured in the callback through to ctx.provider", () => {
    const provider = new FakeStorageProvider();
    const ctx = initSpeelDbContext(TestCtx, (b) => b.useProvider(provider));
    expect(ctx.provider).toBe(provider);
  });

  it("throws (before constructing the context) when no provider is configured", () => {
    let modelCreatingCalled = false;
    class SpyCtx extends DbContext {
      public blogs = this.set(Blog);
      protected onModelCreating(builder: ModelBuilder): void {
        modelCreatingCalled = true;
        builder
          .entity(Blog)
          .toList("Blogs")
          .property((e) => e.Title)
          .isText();
      }
    }
    expect(() =>
      initSpeelDbContext(SpyCtx, () => {
        /* no provider */
      }),
    ).toThrow(InvalidOperationException);
    // The context constructor (which calls onModelCreating) was never reached.
    expect(modelCreatingCalled).toBe(false);
  });
});
