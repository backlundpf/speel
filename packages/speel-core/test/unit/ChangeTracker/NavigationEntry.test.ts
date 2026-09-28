import { it, expect, vi } from "vitest";
import {
  ModelBuilder,
  ChangeTracker,
  EntityState,
} from "../../../src/index.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";
import { InvalidOperationException } from "../../../src/errors.js";

class Child {
  Id?: number;
  Parent: Parent | null = null;
  ParentId: number | null = null;
}
class Parent {
  Id?: number;
  Title: string | null = null;
  Children: Child[] | null = null;
  Owner: Child | null = null;
  OwnerId: number | null = null;
}

function ctx(loader?: (...a: unknown[]) => Promise<unknown>) {
  const mb = new ModelBuilder();
  mb.entity(Parent, (e) => {
    e.toList("Parents");
    e.property((x) => x.Title).isText();
    e.hasMany(Child, (x) => x.Children).withOne((c) => c.Parent);
    e.hasOne(Child, (x) => x.Owner).withMany();
  });
  mb.entity(Child, (e) => {
    e.toList("Children");
    e.hasOne(Parent, (x) => x.Parent).withMany((p) => p.Children);
  });
  const t = new ChangeTracker(mb.build(), undefined, loader as never);
  const p = Object.assign(new Parent(), { Id: 1, OwnerId: 5 });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );
  return { t, p, entry };
}

it("resolves a navigation by lambda and by name", () => {
  const { entry } = ctx();
  expect(entry.collection((p) => p.Children).isLoaded).toBe(false);
  expect(entry.collection("Children").isLoaded).toBe(false);
});

it("reference() rejects a collection navigation", () => {
  const { entry } = ctx();
  expect(() => entry.reference((p) => p.Children)).toThrow(
    InvalidOperationException,
  );
});

it("collection() rejects a reference navigation", () => {
  const { entry } = ctx();
  expect(() => entry.collection((p) => p.Owner)).toThrow(
    InvalidOperationException,
  );
});

it("throws on an unknown navigation name", () => {
  const { entry } = ctx();
  expect(() => entry.reference("Nope")).toThrow(InvalidOperationException);
});

it("loads a reference and exposes it as currentValue", async () => {
  const owner = Object.assign(new Child(), { Id: 5 });
  const { p, entry } = ctx(vi.fn().mockResolvedValue(owner));
  const handle = entry.reference<Child>((x) => x.Owner);

  await handle.loadAsync();

  expect(handle.currentValue).toBe(owner);
  expect(handle.isLoaded).toBe(true);
  expect(p.Owner).toBe(owner);
});

it("currentValue is a live read of the entity, so two handles agree", async () => {
  const kids = [Object.assign(new Child(), { Id: 7 })];
  const { entry } = ctx(vi.fn().mockResolvedValue(kids));
  await entry.collection<Child>("Children").loadAsync();
  expect(entry.collection<Child>("Children").currentValue).toBe(kids);
  expect(entry.collection<Child>("Children").isLoaded).toBe(true);
});

it("collection currentValue is [] before a load", () => {
  const { entry } = ctx();
  expect(entry.collection<Child>("Children").currentValue).toEqual([]);
});
