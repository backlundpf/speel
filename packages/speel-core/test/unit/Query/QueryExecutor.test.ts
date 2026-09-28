// test/unit/Query/QueryExecutor.test.ts
import { describe, it, expect } from "vitest";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Blog {
  Id?: number;
  Title?: string;
  ViewCount?: number;
}

function setup() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const views = new Property({
    propertyName: "ViewCount",
    columnName: "ViewCount",
    displayName: "ViewCount",
    config: { kind: "Number" },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title, views],
  });
  const model = new Model([et]);
  const provider = new FakeStorageProvider();
  const tracker = new ChangeTracker(model, provider);
  const executor = new QueryExecutor<Blog>(provider, tracker);
  const base = Query.empty<Blog>(et, executor);
  return { et, model, provider, tracker, executor, base };
}

async function seed(provider: FakeStorageProvider, n: number) {
  const list = { kind: "title" as const, value: "Blogs" };
  for (let i = 1; i <= n; i++) {
    provider.seedRow(list, { Title: `T${i}`, ViewCount: i * 10 });
  }
}

describe("QueryExecutor.toArrayAsync", () => {
  it("returns all items with no chain", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    const r = await base.toArrayAsync();
    expect(r.length).toBe(3);
    expect(r.map((b) => b.Title)).toEqual(["T1", "T2", "T3"]);
  });

  it("applies a where filter", async () => {
    const { provider, base } = setup();
    await seed(provider, 5);
    const r = await base.where((b) => b.ViewCount.gt(20)).toArrayAsync();
    expect(r.length).toBe(3);
    expect(r.every((b) => b.ViewCount! > 20)).toBe(true);
  });

  it("applies orderBy desc", async () => {
    const { provider, base } = setup();
    await seed(provider, 4);
    const r = await base.orderBy((b) => b.ViewCount, "desc").toArrayAsync();
    expect(r.map((b) => b.ViewCount)).toEqual([40, 30, 20, 10]);
  });

  it("honors take(n)", async () => {
    const { provider, base } = setup();
    await seed(provider, 10);
    const r = await base.take(3).toArrayAsync();
    expect(r.length).toBe(3);
  });

  it("honors skip(n)", async () => {
    const { provider, base } = setup();
    await seed(provider, 5);
    const r = await base.skip(2).toArrayAsync();
    expect(r.length).toBe(3);
    expect(r.map((b) => b.Title)).toEqual(["T3", "T4", "T5"]);
  });

  it("combines skip + take", async () => {
    const { provider, base } = setup();
    await seed(provider, 10);
    const r = await base.skip(3).take(4).toArrayAsync();
    expect(r.length).toBe(4);
    expect(r.map((b) => b.Title)).toEqual(["T4", "T5", "T6", "T7"]);
  });

  it("uses identity map for already-tracked entities (default tracking)", async () => {
    const { provider, base, tracker } = setup();
    await seed(provider, 3);
    const initial = await base.toArrayAsync();
    const sameRef = (await base.toArrayAsync())[0]!;
    expect(sameRef).toBe(initial[0]);
    expect(tracker.entries(Blog).length).toBe(3);
  });

  it("asNoTracking returns fresh untracked entities", async () => {
    const { provider, base, tracker } = setup();
    await seed(provider, 2);
    const r = await base.asNoTracking().toArrayAsync();
    expect(r.length).toBe(2);
    expect(tracker.entries(Blog).length).toBe(0);
  });

  it("asNoTracking returns a DIFFERENT instance even if id is tracked", async () => {
    const { provider, base } = setup();
    await seed(provider, 1);
    const tracked = (await base.toArrayAsync())[0]!;
    const fresh = (await base.asNoTracking().toArrayAsync())[0]!;
    expect(fresh).not.toBe(tracked);
    expect(fresh.Title).toBe(tracked.Title);
  });
});
