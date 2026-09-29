import { describe, it, expect } from "vitest";
import {
  collectForeignKeyIds,
  planIncludeLevel,
  applyIncludeLevel,
} from "../../../src/Query/IncludeResolver.js";
import { runReadBatch } from "../../../src/Query/ReadBatch.js";
import type { INavigation } from "../../../src/Metadata/Navigation.js";
import type { Property } from "../../../src/Metadata/Property.js";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import type { ISharePointProvider } from "../../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../../src/types.js";

/**
 * Resolve ONE navigation end-to-end. This is what resolveIncludeLevel used to be,
 * before the executor started planning a whole depth at a time; keeping it here
 * preserves these assertions without keeping a production function that has no
 * production caller.
 */
async function resolveOne(
  entities: readonly object[],
  nav: INavigation,
  provider: ISharePointProvider,
  tracker: ChangeTracker,
  noTracking: boolean,
): Promise<readonly Record<string, unknown>[]> {
  // Entity instances are plain property bags at runtime; the resolver reads them by key.
  const parents = entities as readonly Record<string, unknown>[];
  let seq = 0;
  const ops = planIncludeLevel(parents, nav, provider, () => `r${seq++}`);
  const byToken = await runReadBatch(provider, ops);
  const records = ops.flatMap((op) => [...(byToken.get(op.clientToken) ?? [])]);
  return applyIncludeLevel(parents, nav, records, tracker, noTracking);
}

const users: IListHandle = { kind: "title", value: "UserInfo" };

function fakeNav(opts: Partial<INavigation>): INavigation {
  return {
    name: "X",
    kind: "reference",
    storage: "self-fk-scalar",
    target: {} as INavigation["target"],
    foreignKey: { propertyName: "AuthorId" } as Property,
    ...opts,
  } as INavigation;
}

describe("collectForeignKeyIds", () => {
  it("self-fk-scalar: distinct, skips null/undefined", () => {
    const parents = [
      { AuthorId: 1 },
      { AuthorId: 2 },
      { AuthorId: 1 },
      { AuthorId: undefined },
      { AuthorId: null },
    ];
    const nav = fakeNav({
      storage: "self-fk-scalar",
      foreignKey: { propertyName: "AuthorId" } as Property,
    });
    expect(collectForeignKeyIds(parents, nav)).toEqual([1, 2]);
  });

  it("self-fk-array: flattens, distinct, drops empties", () => {
    const parents = [
      { TagsId: [1, 2] },
      { TagsId: [2, 3] },
      { TagsId: undefined },
      { TagsId: [] },
    ];
    const nav = fakeNav({
      storage: "self-fk-array",
      foreignKey: { propertyName: "TagsId" } as Property,
    });
    expect(collectForeignKeyIds(parents, nav)).toEqual([1, 2, 3]);
  });

  it("inverse-fk: returns parent Ids (the FK target on children)", () => {
    const parents = [{ Id: 5 }, { Id: 6 }, { Id: 5 }];
    const nav = fakeNav({ storage: "inverse-fk" });
    expect(collectForeignKeyIds(parents, nav)).toEqual([5, 6]);
  });
});

describe("include resolution — reference", () => {
  class User2 {
    Id?: number;
    Title?: string;
  }
  class Blog2 {
    Id?: number;
    AuthorId?: number;
    Author?: User2;
  }

  function buildModel() {
    const mb = new ModelBuilder();
    mb.entity(User2, (b) => {
      b.toList("UserInfo");
      b.property((e) => e.Title).isText();
    });
    mb.entity(Blog2, (b) => {
      b.toList("Blogs");
      b.hasOne(User2, (e) => e.Author)
        .withMany()
        .hasForeignKey((e) => e.AuthorId);
    });
    return mb.build();
  }

  it("attaches Author to each parent by FK lookup", async () => {
    const provider = new FakeStorageProvider();
    provider.seedRow(users, { Title: "A" });
    provider.seedRow(users, { Title: "B" });
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const blogEt = model.findEntityType(Blog2)!;
    const nav = blogEt.findNavigation("Author")!;
    const parents = [new Blog2(), new Blog2()];
    Object.assign(parents[0]!, { Id: 1, AuthorId: 1 });
    Object.assign(parents[1]!, { Id: 2, AuthorId: 2 });

    await resolveOne(parents, nav, provider, tracker, false);
    expect((parents[0] as Blog2).Author?.Title).toBe("A");
    expect((parents[1] as Blog2).Author?.Title).toBe("B");
  });

  it("leaves Author undefined when FK is undefined", async () => {
    const provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const blogEt = model.findEntityType(Blog2)!;
    const nav = blogEt.findNavigation("Author")!;
    const parent = Object.assign(new Blog2(), { Id: 1 });
    await resolveOne([parent], nav, provider, tracker, false);
    expect(parent.Author).toBeUndefined();
  });

  it("asNoTracking=true produces fresh instances, not tracked", async () => {
    const provider = new FakeStorageProvider();
    provider.seedRow(users, { Title: "A" });
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const nav = model.findEntityType(Blog2)!.findNavigation("Author")!;
    const parent = Object.assign(new Blog2(), { Id: 1, AuthorId: 1 });
    await resolveOne([parent], nav, provider, tracker, true);
    expect(parent.Author?.Title).toBe("A");
    expect(tracker.entries(User2).length).toBe(0);
  });
});

describe("include resolution — one fetched record materializes once", () => {
  // Materialize copies nothing (a record handed to core is core's, consumed once),
  // so a record shared by N parents must become ONE entity, not N entities that
  // alias the record's arrays and Dates. The next level must also see it once.
  class Person {
    Id?: number;
    Title?: string;
    Aliases?: string[];
  }
  class Doc {
    Id?: number;
    OwnerId?: number;
    Owner?: Person;
    ReviewersId?: number[];
    Reviewers?: Person[];
  }
  const people: IListHandle = { kind: "title", value: "People" };

  function buildModel() {
    const mb = new ModelBuilder();
    mb.entity(Person, (b) => {
      b.toList("People");
      b.property((e) => e.Title).isText();
      b.property((e) => e.Aliases)
        .isMultiChoice()
        .hasOptions(["p", "p1", "p2", "x"]);
    });
    mb.entity(Doc, (b) => {
      b.toList("Docs");
      b.hasOne(Person, (e) => e.Owner)
        .withMany()
        .hasForeignKey((e) => e.OwnerId);
      b.hasMany(Person, (e) => e.Reviewers)
        .withMany()
        .hasForeignKey((e) => e.ReviewersId);
    });
    return mb.build();
  }

  it("self-fk-scalar, asNoTracking: two parents sharing an FK share one instance, out holds it once, and the alias stops there", async () => {
    const provider = new FakeStorageProvider();
    provider.seedRow(people, { Title: "P", Aliases: ["p"] });
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const nav = model.findEntityType(Doc)!.findNavigation("Owner")!;
    const a = Object.assign(new Doc(), { Id: 1, OwnerId: 1 });
    const b = Object.assign(new Doc(), { Id: 2, OwnerId: 1 });

    const out = await resolveOne([a, b], nav, provider, tracker, true);
    expect(a.Owner).toBe(b.Owner);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(a.Owner);

    // The isolation point: an edit through the shared instance is visible through
    // the other parent (same instance, by design) and nowhere else — a fresh
    // resolve hands back the provider's untouched value in a new instance.
    a.Owner!.Aliases!.push("x");
    expect(b.Owner!.Aliases).toEqual(["p", "x"]);
    const c = Object.assign(new Doc(), { Id: 3, OwnerId: 1 });
    await resolveOne(
      [c],
      nav,
      provider,
      new ChangeTracker(model, provider),
      true,
    );
    expect(c.Owner).not.toBe(a.Owner);
    expect(c.Owner!.Aliases).toEqual(["p"]);
  });

  it("self-fk-array, asNoTracking: the same record across two parents' arrays is one instance, out holds each once", async () => {
    const provider = new FakeStorageProvider();
    provider.seedRow(people, { Title: "P1", Aliases: ["p1"] });
    provider.seedRow(people, { Title: "P2", Aliases: ["p2"] });
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const nav = model.findEntityType(Doc)!.findNavigation("Reviewers")!;
    const a = Object.assign(new Doc(), { Id: 1, ReviewersId: [1, 2] });
    const b = Object.assign(new Doc(), { Id: 2, ReviewersId: [2, 1] });

    const out = await resolveOne([a, b], nav, provider, tracker, true);
    expect(a.Reviewers!.map((p) => p.Title)).toEqual(["P1", "P2"]);
    expect(b.Reviewers!.map((p) => p.Title)).toEqual(["P2", "P1"]);
    expect(a.Reviewers![0]).toBe(b.Reviewers![1]);
    expect(a.Reviewers![1]).toBe(b.Reviewers![0]);
    expect(out).toHaveLength(2);

    a.Reviewers![0]!.Aliases!.push("x");
    expect(b.Reviewers![1]!.Aliases).toEqual(["p1", "x"]);
    const c = Object.assign(new Doc(), { Id: 3, ReviewersId: [1] });
    await resolveOne(
      [c],
      nav,
      provider,
      new ChangeTracker(model, provider),
      true,
    );
    expect(c.Reviewers![0]!.Aliases).toEqual(["p1"]);
  });

  it("tracked: the identity map already yields one instance, and out now agrees — one entry per record", async () => {
    const provider = new FakeStorageProvider();
    provider.seedRow(people, { Title: "P", Aliases: ["p"] });
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    const nav = model.findEntityType(Doc)!.findNavigation("Owner")!;
    const a = Object.assign(new Doc(), { Id: 1, OwnerId: 1 });
    const b = Object.assign(new Doc(), { Id: 2, OwnerId: 1 });

    const out = await resolveOne([a, b], nav, provider, tracker, false);
    expect(a.Owner).toBe(b.Owner);
    expect(out).toHaveLength(1);
    expect(tracker.entries(Person)).toHaveLength(1);
  });
});
