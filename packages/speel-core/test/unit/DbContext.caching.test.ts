import { describe, it, expect } from "vitest";
import { DbContext } from "../../src/DbContext.js";
import { initSpeelDbContext } from "../../src/initSpeelDbContext.js";
import { ModelBuilder } from "../../src/ModelBuilder/ModelBuilder.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InMemoryCacheProvider } from "../../src/Cache/InMemoryCacheProvider.js";
import { InvalidOperationException } from "../../src/errors.js";
import { TestSiteUser as SiteUser } from "./fakes/testPrincipals.js";

class Project {
  Id?: number;
  Title?: string;
}

class CachedCtx extends DbContext {
  public projects = this.set(Project);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((p) => p.Title).isText();
      e.useCaching((c) => c.withTimeout(1_000_000));
    });
  }
}

class UncachedCtx extends DbContext {
  public projects = this.set(Project);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((p) => p.Title).isText();
    });
  }
}

function seed(sp: FakeStorageProvider, title: string): number {
  return sp.seedRow({ kind: "title", value: "Projects" }, { Title: title });
}

describe("DbContext caching", () => {
  it("markCacheStaleAsync forces the next cacheAsync to re-sync inside the TTL window", async () => {
    const sp = new FakeStorageProvider();
    seed(sp, "A");
    const ctx = initSpeelDbContext(CachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    }); // CachedCtx TTL is 1_000_000 ms — nothing re-syncs on its own
    expect((await ctx.projects.cacheAsync()).map((p) => p.Title)).toEqual([
      "A",
    ]);
    seed(sp, "B");
    // Still inside the TTL: the provider-side add stays invisible…
    expect((await ctx.projects.cacheAsync()).map((p) => p.Title)).toEqual([
      "A",
    ]);
    // …until the cache is explicitly invalidated.
    await ctx.projects.markCacheStaleAsync();
    expect(
      (await ctx.projects.cacheAsync()).map((p) => p.Title).sort(),
    ).toEqual(["A", "B"]);
  });

  it("markCacheStaleAsync shares cacheAsync's error contract", async () => {
    const sp = new FakeStorageProvider();
    const noProvider = initSpeelDbContext(CachedCtx, (b) => b.useProvider(sp));
    await expect(noProvider.projects.markCacheStaleAsync()).rejects.toThrow(
      /requires a cache provider/,
    );
    const noOptIn = initSpeelDbContext(UncachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    await expect(noOptIn.projects.markCacheStaleAsync()).rejects.toThrow(
      /opt into caching/,
    );
  });

  it("cacheAsync returns all items for a cached entity", async () => {
    const sp = new FakeStorageProvider();
    seed(sp, "A");
    seed(sp, "B");
    const ctx = initSpeelDbContext(CachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    const items = await ctx.projects.cacheAsync();
    expect(items.map((p) => p.Title).sort()).toEqual(["A", "B"]);
  });

  it("throws when no cache provider is registered on the context", async () => {
    const sp = new FakeStorageProvider();
    const ctx = initSpeelDbContext(CachedCtx, (b) => b.useProvider(sp));
    await expect(ctx.projects.cacheAsync()).rejects.toThrow(
      InvalidOperationException,
    );
  });

  it("throws when the entity did not opt into caching", async () => {
    const sp = new FakeStorageProvider();
    const ctx = initSpeelDbContext(UncachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    await expect(ctx.projects.cacheAsync()).rejects.toThrow(
      InvalidOperationException,
    );
  });

  it("throws when the cached entity is not list-backed", async () => {
    class UserCacheCtx extends DbContext {
      public users = this.set(SiteUser);
      protected onModelCreating(b: ModelBuilder): void {
        b.entity(SiteUser, (e) => {
          e.toProviderSource({ kind: "provider", key: "siteUsers" });
          e.useCaching();
        });
      }
    }
    const sp = new FakeStorageProvider();
    const ctx = initSpeelDbContext(UserCacheCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    await expect(ctx.users.cacheAsync()).rejects.toThrow(
      /not a cacheable list/,
    );
  });

  it("saveChangesAsync marks the cache stale so the next cacheAsync re-syncs inside the TTL window", async () => {
    const sp = new FakeStorageProvider();
    seed(sp, "A");
    const ctx = initSpeelDbContext(CachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    await ctx.projects.cacheAsync(); // warm the cache (TTL window is huge)

    const p = new Project();
    p.Title = "New";
    ctx.projects.add(p);
    await ctx.saveChangesAsync(); // should mark Projects stale

    const items = await ctx.projects.cacheAsync();
    expect(items.map((x) => x.Title).sort()).toEqual(["A", "New"]);
  });
});
