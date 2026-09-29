import { it, expect, vi } from "vitest";
import {
  ModelBuilder,
  ChangeTracker,
  EntityState,
  DbContext,
  initSpeelDbContext,
} from "../../../src/index.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { InvalidOperationException } from "../../../src/errors.js";
import type { INavigation } from "../../../src/Metadata/Navigation.js";
import type { IListHandle } from "../../../src/types.js";
import { FakeStorageProvider } from "../../../src/testing/FakeStorageProvider.js";

class Child {
  Id?: number;
  Parent: Parent | null = null;
  ParentId: number | null = null;
}
class Parent {
  Id?: number;
  Title: string | null = null;
  Children: Child[] | null = null;
}

function model() {
  const mb = new ModelBuilder();
  mb.entity(Parent, (e) => {
    e.toList("Parents");
    e.property((x) => x.Title).isText();
    e.hasMany(Child, (x) => x.Children).withOne((c) => c.Parent);
  });
  mb.entity(Child, (e) => {
    e.toList("Children");
    e.hasOne(Parent, (x) => x.Parent).withMany((p) => p.Children);
  });
  return mb.build();
}

function navOf(t: ChangeTracker, p: Parent, name: string): INavigation {
  return t
    .entry(p)
    .entityType.navigations()
    .find((n) => n.name === name)!;
}

it("assigns the loaded value and marks the navigation loaded", async () => {
  const loaded = [Object.assign(new Child(), { Id: 7 })];
  const loader = vi.fn().mockResolvedValue(loaded);
  const t = new ChangeTracker(model(), undefined, loader);
  const p = Object.assign(new Parent(), { Id: 1 });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );

  await entry.loadNavAsync(navOf(t, p, "Children"), false);

  expect(p.Children).toBe(loaded);
  expect(entry.isNavLoaded("Children")).toBe(true);
  expect(entry.originalNavId("Children")).toEqual([7]);
});

it("is a no-op on the second call, and re-fetches when forced", async () => {
  const loader = vi.fn().mockResolvedValue([]);
  const t = new ChangeTracker(model(), undefined, loader);
  const p = Object.assign(new Parent(), { Id: 1 });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );
  const nav = navOf(t, p, "Children");

  await entry.loadNavAsync(nav, false);
  await entry.loadNavAsync(nav, false);
  expect(loader).toHaveBeenCalledTimes(1);

  await entry.loadNavAsync(nav, true);
  expect(loader).toHaveBeenCalledTimes(2);
});

it("marks an empty collection loaded rather than reloading it forever", async () => {
  const loader = vi.fn().mockResolvedValue([]);
  const t = new ChangeTracker(model(), undefined, loader);
  const p = Object.assign(new Parent(), { Id: 1 });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );

  await entry.loadNavAsync(navOf(t, p, "Children"), false);
  expect(entry.isNavLoaded("Children")).toBe(true);
  expect(p.Children).toEqual([]);
});

// Goes through the real reload() — reload() clears #loadedNavs inline, so asserting
// against any other clearing helper would leave the production path untested.
it("reload() clears loaded navigations, so the next load re-fetches", async () => {
  const loader = vi.fn().mockResolvedValue([]);
  const provider = new FakeStorageProvider();
  provider.seedRow({ kind: "title", value: "Parents" }, { Title: "A" });
  const t = new ChangeTracker(model(), provider, loader);
  const p = Object.assign(new Parent(), { Id: 1, Title: "A" });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );
  const nav = navOf(t, p, "Children");
  await entry.loadNavAsync(nav, false);
  expect(entry.isNavLoaded("Children")).toBe(true);

  await entry.reload();

  expect(entry.isNavLoaded("Children")).toBe(false);
  await entry.loadNavAsync(nav, false);
  expect(loader).toHaveBeenCalledTimes(2);
});

it("throws when the tracker has no loader", async () => {
  const t = new ChangeTracker(model());
  const p = Object.assign(new Parent(), { Id: 1 });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );
  await expect(
    entry.loadNavAsync(navOf(t, p, "Children"), false),
  ).rejects.toThrow(InvalidOperationException);
});

// --- DbContext's real loader: a kind:'reference' navigation stored inverse-fk ---
//
// This combination (a one-to-one whose FK lives on the OTHER entity — @OneToOne /
// hasOne(...).withOne(...)) is real and shipped (see navDecorators.test.ts's
// Blog.Banner). The stub-loader tests above cover ChangeTracker/EntityEntry
// plumbing, but a stub can't catch a DbContext#loadNavAsync bug that conflates
// nav.kind with nav.storage in the inverse-fk branch — only the real loader,
// exercised through DbContext + FakeStorageProvider, can.

class Blog {
  Id?: number;
  Title: string | null = null;
  Banner: Tag | null = null;
}
class Tag {
  Id?: number;
  Title: string | null = null;
  Blog: Blog | null = null;
  BlogId: number | null = null;
}

class BannerCtx extends DbContext {
  public blogs = this.set(Blog);
  public tags = this.set(Tag);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Blog, (e) => {
      e.toList("Blogs");
      e.property((x) => x.Title).isText();
      e.hasOne(Tag, (x) => x.Banner).withOne((t) => t.Blog);
    });
    b.entity(Tag, (e) => {
      e.toList("Tags");
      e.property((x) => x.Title).isText();
    });
  }
}

const blogsHandle: IListHandle = { kind: "title", value: "Blogs" };
const tagsHandle: IListHandle = { kind: "title", value: "Tags" };

it("DbContext loader assigns the single matched object for a reference navigation stored inverse-fk (not a one-element array)", async () => {
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(BannerCtx, (b) => b.useProvider(provider));
  provider.seedRow(blogsHandle, { Title: "B" });
  provider.seedRow(tagsHandle, { Title: "T", BlogId: 1 });
  const blog = Object.assign(new Blog(), { Id: 1, Title: "B" });
  ctx.set(Blog).attach(blog);
  const entry = ctx.entry(blog);
  const nav = entry.entityType.navigations().find((n) => n.name === "Banner")!;
  expect(nav).toMatchObject({ kind: "reference", storage: "inverse-fk" });

  await entry.loadNavAsync(nav, false);

  expect(Array.isArray(blog.Banner)).toBe(false);
  expect(blog.Banner).toBeInstanceOf(Tag);
  expect((blog.Banner as Tag).Id).toBe(1);
});

it("DbContext loader assigns undefined, not [], for a reference navigation stored inverse-fk with no match", async () => {
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(BannerCtx, (b) => b.useProvider(provider));
  provider.seedRow(blogsHandle, { Title: "B" });
  const blog = Object.assign(new Blog(), { Id: 1, Title: "B" });
  ctx.set(Blog).attach(blog);
  const entry = ctx.entry(blog);
  const nav = entry.entityType.navigations().find((n) => n.name === "Banner")!;

  await entry.loadNavAsync(nav, false);

  expect(blog.Banner).toBeUndefined();
  expect(entry.isNavLoaded("Banner")).toBe(true);
});
