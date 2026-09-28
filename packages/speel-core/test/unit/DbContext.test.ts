// test/unit/DbContext.test.ts
import { describe, it, expect } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { DbContextOptionsBuilder } from "../../src/DbContextOptionsBuilder.js";
import { initSpeelDbContext } from "../../src/initSpeelDbContext.js";
import { DbSet } from "../../src/DbSet.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../src/errors.js";
import { TestSiteUser as SiteUser } from "./fakes/testPrincipals.js";

class Blog {
  Id?: number;
  Title?: string;
}
class Comment {
  Id?: number;
  Body?: string;
}
class Unregistered {
  Id?: number;
}

class TestCtx extends DbContext {
  public blogs = this.set(Blog);
  public comments = this.set(Comment);
  protected onModelCreating(builder: ModelBuilder): void {
    builder.entity(Blog, (b) => {
      b.toList("Blogs");
      b.property((e) => e.Title).isText();
    });
    builder.entity(Comment, (b) => {
      b.toList("Comments");
      b.property((e) => e.Body).isNote();
    });
  }
}

function newCtx(): TestCtx {
  return initSpeelDbContext(TestCtx, (b) =>
    b.useProvider(new FakeStorageProvider()),
  );
}

describe("DbContext", () => {
  it("builds the model and assigns DbSets", () => {
    const ctx = newCtx();
    expect(ctx.blogs).toBeInstanceOf(DbSet);
    expect(ctx.comments).toBeInstanceOf(DbSet);
    expect(ctx.changeTracker).toBeDefined();
  });

  it("set() returns the same DbSet instance for repeated lookups of one entity", () => {
    class StableCtx extends DbContext {
      public a = this.set(Blog);
      public b = this.set(Blog);
      protected onModelCreating(builder: ModelBuilder): void {
        builder
          .entity(Blog)
          .toList("Blogs")
          .property((e) => e.Title)
          .isText();
      }
    }
    const ctx = initSpeelDbContext(StableCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(ctx.a).toBe(ctx.b);
  });

  it("set() returns distinct DbSets for distinct entities", () => {
    const ctx = newCtx();
    expect(ctx.blogs).not.toBe(ctx.comments);
  });

  it("set()ing an entity that is never configured throws when the model builds (lazily)", () => {
    class BadCtx extends DbContext {
      public bad = this.set(Unregistered);
      protected onModelCreating(b: ModelBuilder): void {
        b.entity(Blog)
          .toList("Blogs")
          .property((e) => e.Title)
          .isText();
      }
    }
    // set() is now the declaration; an entity with no source (no @Entity, no onModelCreating
    // config) surfaces as a build error on first model access, not eagerly at set().
    const ctx = initSpeelDbContext(BadCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(() => ctx.model).toThrow(/Unregistered/);
  });

  it("set() resolves the auto-registered SiteUser", () => {
    class UserCtx extends DbContext {
      public users = this.set(SiteUser);
      protected onModelCreating(_b: ModelBuilder): void {
        /* none */
      }
    }
    const ctx = initSpeelDbContext(UserCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(ctx.users).toBeInstanceOf(DbSet);
  });

  it("a malformed model throws on first access (lazy build)", () => {
    class BrokenCtx extends DbContext {
      protected onModelCreating(): void {
        throw new Error("boom");
      }
    }
    // Construction is lazy now — onModelCreating runs on first model access, not in the ctor.
    const ctx = initSpeelDbContext(BrokenCtx, (b) =>
      b.useProvider(new FakeStorageProvider()),
    );
    expect(() => ctx.model).toThrow("boom");
  });

  it("new Ctx(options) still works without the factory", () => {
    const provider = new FakeStorageProvider();
    const ctx = new TestCtx(
      new DbContextOptionsBuilder().useProvider(provider).options,
    );
    expect(ctx.provider).toBe(provider);
    expect(ctx.blogs).toBeInstanceOf(DbSet);
  });

  it("saveChangesAsync returns 0 with no changes", async () => {
    expect(await newCtx().saveChangesAsync()).toBe(0);
  });

  it("dispose() clears tracker; subsequent calls throw", () => {
    const ctx = newCtx();
    ctx.dispose();
    expect(() => ctx.blogs.add(new Blog())).toThrow(InvalidOperationException);
  });

  it("supports the using disposal protocol", () => {
    const ctx = newCtx();
    expect(
      typeof (ctx as unknown as { [Symbol.dispose]: () => void })[
        Symbol.dispose
      ],
    ).toBe("function");
    (ctx as unknown as { [Symbol.dispose]: () => void })[Symbol.dispose]();
    expect(() => ctx.blogs.add(new Blog())).toThrow();
  });

  it("end-to-end CRUD round-trip through a DbContext", async () => {
    const ctx = newCtx();
    const b = new Blog();
    b.Title = "Hi";
    ctx.blogs.add(b);
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect(b.Id).toBeGreaterThan(0);

    b.Title = "Hi 2";
    expect(await ctx.saveChangesAsync()).toBe(1);

    const refound = await ctx.blogs.findAsync(b.Id!);
    expect(refound).toBe(b);

    ctx.blogs.remove(b);
    expect(await ctx.saveChangesAsync()).toBe(1);
    expect(await ctx.blogs.findAsync(b.Id!)).toBeNull();
  });
});
