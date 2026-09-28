import { describe, it, expect, vi } from "vitest";
import { CacheCoordinator } from "../../../src/Cache/CacheCoordinator.js";
import { InMemoryCacheProvider } from "../../../src/Cache/InMemoryCacheProvider.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import type { EntityTypeBuilder } from "../../../src/ModelBuilder/EntityTypeBuilder.js";
import type { IListHandle } from "../../../src/types.js";
import { listKey } from "../../../src/Cache/listKey.js";
import { TestSiteUser as SiteUser } from "../fakes/testPrincipals.js";

class Project {
  Id?: number;
  Title?: string;
  Owner?: SiteUser | null;
  OwnerId?: number;
}
const LIST: IListHandle = { kind: "title", value: "Projects" };

/** A nav whose SP lookup column name differs from its TS property name. */
class Doc {
  Id?: number;
  Title?: string;
  OwnerId?: number;
  Manager?: SiteUser | null;
}

function setup(configure: (b: EntityTypeBuilder<Project>) => void) {
  const mb = new ModelBuilder();
  mb.entity(SiteUser, (b) => {
    b.toList({ title: "UserInfo" });
    b.property((u) => u.Title).isText();
  });
  mb.entity(Project, (b) => {
    b.toList("Projects");
    b.property((p) => p.Title).isText();
    b.hasOne(SiteUser, (p) => p.Owner)
      .withMany()
      .hasForeignKey((p) => p.OwnerId);
    configure(b);
  });
  const model = mb.build();
  const sp = new FakeStorageProvider();
  const cache = new InMemoryCacheProvider();
  const coordinator = new CacheCoordinator(cache, sp);
  return { et: model.findEntityType(Project)!, sp, cache, coordinator };
}

function add(sp: FakeStorageProvider, title: string, ownerId?: number): number {
  const row: Record<string, unknown> = { Title: title };
  if (ownerId !== undefined) row.OwnerId = ownerId;
  return sp.seedRow(LIST, row);
}

describe("CacheCoordinator.loadAllAsync", () => {
  it("first call full-loads all items as untracked entities", async () => {
    const { et, sp, coordinator } = setup((b) => b.useCaching());
    add(sp, "A");
    add(sp, "B");
    const items = (await coordinator.loadAllAsync(et)) as Project[];
    expect(items.map((p) => p.Title).sort()).toEqual(["A", "B"]);
    expect(items[0]).toBeInstanceOf(Project);
  });

  it("always-sync (no timeout) picks up adds and deletes on the next call", async () => {
    const { et, sp, coordinator } = setup((b) => b.useCaching());
    const idA = add(sp, "A");
    await coordinator.loadAllAsync(et);
    const idC = add(sp, "C");
    await sp.executeBatchAsync([
      {
        kind: "delete",
        list: LIST,
        id: idA,
        etag: "*",
        permanent: false,
        clientToken: "d",
      },
    ]);
    const items = (await coordinator.loadAllAsync(et)) as Project[];
    expect(items.map((p) => p.Id).sort((a, b) => a! - b!)).toEqual([idC]);
  });

  it("within the timeout window it serves the cache without syncing", async () => {
    const { et, sp, cache, coordinator } = setup((b) =>
      b.useCaching((c) => c.withTimeout(1_000_000)),
    );
    add(sp, "A");
    await coordinator.loadAllAsync(et);
    add(sp, "B"); // happens after sync, but inside the window
    const items = (await coordinator.loadAllAsync(et)) as Project[];
    expect(items.map((p) => p.Title)).toEqual(["A"]);
    // sanity: state retained a token
    expect((await cache.read("title:Projects"))!.state.token).toBeDefined();
  });

  it("a stale flag forces a sync even inside the timeout window", async () => {
    const { et, sp, coordinator } = setup((b) =>
      b.useCaching((c) => c.withTimeout(1_000_000)),
    );
    add(sp, "A");
    await coordinator.loadAllAsync(et);
    add(sp, "B");
    await coordinator.markStaleAsync(et);
    const items = (await coordinator.loadAllAsync(et)) as Project[];
    expect(items.map((p) => p.Title).sort()).toEqual(["A", "B"]);
  });

  it("materializes expanded navs configured via useCaching(expand)", async () => {
    const users: IListHandle = { kind: "title", value: "UserInfo" };
    const { et, sp, coordinator } = setup((b) =>
      b.useCaching((c) => c.expand((p) => p.Owner)),
    );
    sp.seedRow(users, { Title: "Ada" });
    sp.registerJoin(LIST, "Owner", {
      foreignKey: "OwnerId",
      targetList: users,
    });
    add(sp, "A", 1);
    const items = (await coordinator.loadAllAsync(et)) as Project[];
    expect((items[0]!.Owner as SiteUser).Title).toBe("Ada");
  });

  it("stamps lastSyncedAt after the sync completes, not before", async () => {
    vi.useFakeTimers();
    try {
      const { et, sp, cache, coordinator } = setup((b) =>
        b.useCaching((c) => c.withTimeout(60_000)),
      );
      add(sp, "A");
      const original = sp.getListItemChangesSinceToken.bind(sp);
      sp.getListItemChangesSinceToken = async (
        ...args: Parameters<typeof original>
      ) => {
        vi.advanceTimersByTime(10_000); // the sync itself takes 10s
        return original(...args);
      };
      const before = Date.now();
      await coordinator.loadAllAsync(et);
      const entry = await cache.read(listKey(LIST));
      expect(entry!.state.lastSyncedAt).toBe(before + 10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws for an entity that did not opt into caching", async () => {
    const { et, coordinator } = setup(() => {
      /* no useCaching() */
    });
    await expect(coordinator.loadAllAsync(et)).rejects.toThrow(
      /Project to opt into caching/,
    );
  });

  it("expands under the SP lookup column name, not the nav property name", async () => {
    const users: IListHandle = { kind: "title", value: "UserInfo" };
    const docs: IListHandle = { kind: "title", value: "Docs" };
    const mb = new ModelBuilder();
    mb.entity(SiteUser, (b) => {
      b.toList({ title: "UserInfo" });
      b.property((u) => u.Title).isText();
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.property((d) => d.Title).isText();
      // SP lookup column 'Owner' (FK 'OwnerId'), surfaced on the entity as `Manager`.
      b.hasOne(SiteUser, (d) => d.Manager)
        .withMany()
        .hasColumnName("Owner");
      b.useCaching((c) => c.expand((d) => d.Manager));
    });
    const model = mb.build();
    const sp = new FakeStorageProvider();
    const coordinator = new CacheCoordinator(new InMemoryCacheProvider(), sp);
    sp.seedRow(users, { Title: "Ada" });
    sp.seedRow(docs, { Title: "D1", OwnerId: 1 });
    // Join registered under the SP column name 'Owner', not the property 'Manager'.
    sp.registerJoin(docs, "Owner", {
      foreignKey: "OwnerId",
      targetList: users,
    });

    const items = (await coordinator.loadAllAsync(
      model.findEntityType(Doc)!,
    )) as Doc[];
    expect((items[0]!.Manager as SiteUser).Title).toBe("Ada");
  });
});
