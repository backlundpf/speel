// test/unit/Query/QueryExecutor.terminals.test.ts
import { describe, it, expect } from "vitest";
import { Query } from "../../../src/Query/Query.js";
import { QueryExecutor } from "../../../src/Query/QueryExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { InvalidOperationException } from "../../../src/errors.js";

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
  return { provider, base };
}

async function seed(provider: FakeStorageProvider, n: number) {
  for (let i = 1; i <= n; i++) {
    provider.seedRow(
      { kind: "title", value: "Blogs" },
      { Title: `T${i}`, ViewCount: i * 10 },
    );
  }
}

describe("QueryExecutor terminals", () => {
  it("firstOrDefaultAsync returns first item", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    const r = await base.firstOrDefaultAsync();
    expect(r).not.toBeNull();
    expect(r!.Title).toBe("T1");
  });

  it("firstOrDefaultAsync returns null on empty", async () => {
    const { base } = setup();
    expect(await base.firstOrDefaultAsync()).toBeNull();
  });

  it("firstOrDefaultAsync honors where", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    const r = await base.where((b) => b.ViewCount.gt(15)).firstOrDefaultAsync();
    expect(r!.ViewCount).toBe(20);
  });

  it("singleOrDefaultAsync returns the one match", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    const r = await base.where((b) => b.Title.eq("T2")).singleOrDefaultAsync();
    expect(r!.Title).toBe("T2");
  });

  it("singleOrDefaultAsync returns null when no match", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    const r = await base
      .where((b) => b.Title.eq("NOPE"))
      .singleOrDefaultAsync();
    expect(r).toBeNull();
  });

  it("singleOrDefaultAsync throws on multiple matches", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    await expect(base.singleOrDefaultAsync()).rejects.toBeInstanceOf(
      InvalidOperationException,
    );
  });

  it("countAsync returns total when no chain", async () => {
    const { provider, base } = setup();
    await seed(provider, 4);
    expect(await base.countAsync()).toBe(4);
  });

  it("countAsync respects filter", async () => {
    const { provider, base } = setup();
    await seed(provider, 5);
    expect(await base.where((b) => b.ViewCount.gt(20)).countAsync()).toBe(3);
  });

  it("countAsync ignores take/skip", async () => {
    const { provider, base } = setup();
    await seed(provider, 5);
    expect(await base.take(2).countAsync()).toBe(5);
    expect(await base.skip(3).countAsync()).toBe(5);
  });

  it("anyAsync true when matches exist", async () => {
    const { provider, base } = setup();
    await seed(provider, 2);
    expect(await base.anyAsync()).toBe(true);
  });

  it("anyAsync false on empty", async () => {
    const { base } = setup();
    expect(await base.anyAsync()).toBe(false);
  });

  it("anyAsync respects filter", async () => {
    const { provider, base } = setup();
    await seed(provider, 3);
    expect(await base.where((b) => b.ViewCount.gt(100)).anyAsync()).toBe(false);
    expect(await base.where((b) => b.ViewCount.gt(15)).anyAsync()).toBe(true);
  });
});
