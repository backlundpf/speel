import { it, expect } from "vitest";
import {
  ModelBuilder,
  ChangeTracker,
  EntityState,
} from "../../../src/index.js";

class Widget {
  Id?: number;
  Title: string | null = null;
}

function tracker(): ChangeTracker {
  const mb = new ModelBuilder();
  mb.entity(Widget, (e) => {
    e.toList("Widgets");
    e.property((x) => x.Title).isText();
  });
  return new ChangeTracker(mb.build());
}

it("returns a Detached entry for an untracked entity", () => {
  const t = tracker();
  const w = Object.assign(new Widget(), { Id: 1, Title: "a" });
  const entry = t.entry(w);
  expect(entry.state).toBe(EntityState.Detached);
  expect(entry.entity).toBe(w);
});

it("returns the same entry on repeated calls", () => {
  const t = tracker();
  const w = Object.assign(new Widget(), { Id: 1 });
  expect(t.entry(w)).toBe(t.entry(w));
});

it("returns the existing entry for an already-tracked entity", () => {
  const t = tracker();
  const w = Object.assign(new Widget(), { Id: 1 });
  const tracked = t.track(w, EntityState.Unchanged);
  expect(t.entry(w)).toBe(tracked);
});

it("a Detached bookkeeping entry does not register as a change", () => {
  const t = tracker();
  t.entry(Object.assign(new Widget(), { Id: 1 }));
  expect(t.hasChanges()).toBe(false);
});

it("track() promotes an existing Detached entry instead of adding a second", () => {
  const t = tracker();
  const w = Object.assign(new Widget(), { Id: 1 });
  const detached = t.entry(w);
  const promoted = t.track(w, EntityState.Added);
  expect(promoted).toBe(detached);
  expect(promoted.state).toBe(EntityState.Added);
  expect(t.entries(Widget)).toHaveLength(1);
});

it("still rejects a different instance colliding on the same id", () => {
  const t = tracker();
  t.track(Object.assign(new Widget(), { Id: 1 }), EntityState.Unchanged);
  expect(() =>
    t.track(Object.assign(new Widget(), { Id: 1 }), EntityState.Unchanged),
  ).toThrow(/already tracked/);
});

it("a Detached bookkeeping entry does not occupy the identity map: a later legitimate track() of a different instance with the same id succeeds", () => {
  const t = tracker();
  t.entry(Object.assign(new Widget(), { Id: 5 }));
  const fresh = Object.assign(new Widget(), { Id: 5, Title: "server value" });
  expect(() => t.track(fresh, EntityState.Unchanged)).not.toThrow();
});

it("findEntry does not resolve a Detached bookkeeping entry", () => {
  const t = tracker();
  t.entry(Object.assign(new Widget(), { Id: 5 }));
  expect(t.findEntry(Widget, 5)).toBeUndefined();
});

it("promoting a Detached entry to a real state registers it in the identity map", () => {
  const t = tracker();
  const w = Object.assign(new Widget(), { Id: 7 });
  t.entry(w);
  const promoted = t.track(w, EntityState.Added);
  expect(t.findEntry(Widget, 7)).toBe(promoted);
});

it("a rejected promotion does not mutate the entry that already held the slot", () => {
  const t = tracker();
  const stub = Object.assign(new Widget(), { Id: 1 });
  const stubEntry = t.entry(stub); // Detached — no slot claimed yet
  const other = Object.assign(new Widget(), { Id: 1 });
  const otherEntry = t.track(other, EntityState.Unchanged); // claims the Widget|1 slot
  expect(() => t.track(stub, EntityState.Added)).toThrow(/already tracked/);
  // The rejected promotion must leave both entries exactly as they were.
  expect(stubEntry.state).toBe(EntityState.Detached);
  expect(otherEntry.state).toBe(EntityState.Unchanged);
  expect(t.findEntry(Widget, 1)).toBe(otherEntry);
});

it("intended: an orphaned Detached placeholder stays in entries() by identity, but findEntry resolves the real tracked entity", () => {
  // By design (no eviction): entry() may create a Detached bookkeeping entry for
  // an id before that id is ever fetched through the context. Once the real
  // entity for that id is tracked (a different instance), the placeholder is
  // excluded from the identity map but is NOT dropped from _entries — later tasks
  // hang per-navigation load state off entries, and silently discarding a
  // bookkeeping entry a caller still holds would discard that state. So
  // entries(ctor) can show two rows for one logical id: the live one (found via
  // findEntry) and the inert placeholder (still reachable only by identity, via
  // entryFor on the original instance).
  const t = tracker();
  const stub = Object.assign(new Widget(), { Id: 9 });
  const stubEntry = t.entry(stub);
  const fresh = Object.assign(new Widget(), { Id: 9, Title: "server value" });
  const freshEntry = t.track(fresh, EntityState.Unchanged);

  expect(t.findEntry(Widget, 9)).toBe(freshEntry);
  expect(t.entryFor(stub)).toBe(stubEntry);
  expect(t.entries(Widget)).toHaveLength(2);
});
