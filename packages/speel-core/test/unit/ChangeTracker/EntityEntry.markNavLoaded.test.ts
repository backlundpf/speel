import { it, expect } from "vitest";
import {
  ModelBuilder,
  ChangeTracker,
  EntityState,
} from "../../../src/index.js";
import { Snapshot } from "../../../src/ChangeTracker/Snapshot.js";

class Child {
  Id?: number;
  Title: string | null = null;
  Parent: Parent | null = null;
  ParentId: number | null = null;
}
class Parent {
  Id?: number;
  Title: string | null = null;
  Children: Child[] | null = null;
}

function build() {
  const mb = new ModelBuilder();
  mb.entity(Parent, (e) => {
    e.toList("Parents");
    e.property((x) => x.Title).isText();
    e.hasMany(Child, (x) => x.Children).withOne((c) => c.Parent);
  });
  mb.entity(Child, (e) => {
    e.toList("Children");
    e.property((x) => x.Title).isText();
    e.hasOne(Parent, (x) => x.Parent).withMany((p) => p.Children);
  });
  return new ChangeTracker(mb.build());
}

it("records the loaded navigation ids into the snapshot", () => {
  const t = build();
  const p = Object.assign(new Parent(), { Id: 1, Title: "p" });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );
  expect(entry.originalNavId("Children")).toBe(null);

  p.Children = [
    Object.assign(new Child(), { Id: 7 }),
    Object.assign(new Child(), { Id: 9 }),
  ];
  entry.markNavLoaded("Children");

  expect(entry.originalNavId("Children")).toEqual([7, 9]);
});

it("does not disturb pending scalar edits", () => {
  const t = build();
  const p = Object.assign(new Parent(), { Id: 1, Title: "original" });
  const entry = t.track(
    p,
    EntityState.Unchanged,
    Snapshot.take(p, t.entry(p).entityType),
  );

  p.Title = "edited"; // a pending, unsaved change
  p.Children = [Object.assign(new Child(), { Id: 7 })];
  entry.markNavLoaded("Children");

  expect(entry.getDirtyColumns()).toContain("Title");
});

it("is a no-op for an entry with no snapshot", () => {
  const t = build();
  const p = new Parent();
  const entry = t.track(p, EntityState.Added);
  p.Children = [Object.assign(new Child(), { Id: 7 })];
  expect(() => entry.markNavLoaded("Children")).not.toThrow();
  expect(entry.originalNavId("Children")).toBe(null);
});
