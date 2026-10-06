# Entity clone, serialize and value transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give speel entities `clone`, `serialize`/`deserialize` (typed `SerializedEntity<T, M>`), `EntityEntry.setValues`, a value-applying `update()`, and an `add()` that tolerates read-only values — plus a form fix so deserialized navigation stubs display.

**Architecture:** The value logic lives in a new `packages/speel-core/src/Entities/` folder (pure functions over `EntityType` metadata); `DbSet` and `EntityEntry` expose it. Json shapes reuse the shape codec through two newly exported object-level functions. `@speel/react`'s `useEntityForm` hydrates untracked navigation targets by id instead of reloading the navigation.

**Tech Stack:** TypeScript (NodeNext, `.js` specifiers), vitest (+ `.test-d.ts` type tests), React 17 + @testing-library/react, changesets.

**Spec:** `docs/superpowers/specs/2026-10-06-entity-copy-serialize-design.md`

## Global Constraints

- Public repo: no consumer names anywhere (code, tests, docs, commits). Use generic entities (Project, Department, Tag, Task).
- Relative imports carry `.js`; package tsconfigs are NodeNext.
- Every PR touching `packages/` adds a changeset; `minor` (never `major` before 1.0).
- Docs: topic pages keep exactly four H2s (What & when / Canonical example / Capabilities / Boundaries & gotchas), 100–250 lines; altitude rule (capabilities, not signatures). Document step runs once, last.
- `@speel/react` ships the Fluent v8 skin only; this change adds no adapter members.
- The SPFx sample must still pass `heft build` after core API changes.

## Spec refinements made while planning (recorded back into the spec)

1. **Unloaded navigation rule.** Entities commonly initialize navigations to `null`, so `undefined` alone cannot mean "not loaded". A navigation value counts as **unloaded** when it is `undefined`; or `null` on an `inverse-fk` navigation (no FK on this side to say otherwise); or `null` while its self-side FK property holds a value (non-null scalar / non-empty array). `[]`, and `null` with an empty FK, are explicit empties. `setValues` skips unloaded navigations; `serialize` omits `undefined` ones and writes `null` as `null`.
2. **Form fix hydrates, it does not reload.** `loadAsync` replaces a navigation's value with server state, which would discard a draft's membership edits and, for an `Id`-less duplicate, load an empty inverse collection. Instead `useEntityForm` replaces each untracked target in a non-null navigation value with `ctx.set(targetCtor).findAsync(id)` (keeping the stub if that fails or returns null), preserving membership.
3. **`add()` warns on `!= null`** read-only values (properties and navigations), matching null-initialized entities; clearing after insert writes `undefined`.
4. **`update(clone)` on a `Deleted` tracked original** revives it (`Modified`) before applying values — today's undelete behaviour, kept.

## Review Focus

- **Null-initialized navigations.** A clone of an entity whose nav is `null` (not loaded) passed to `update()` must not clear a nav the original has since loaded. Test in Task 2 (`setValues` skips null-with-FK and inverse-fk null).
- **Clone shown in a form, then `update(clone)`.** The form creates a Detached entry for the clone; `update()` must still find the tracked original (Detached entries never claim the identity slot). Test in Task 3.
- **SpeelEntity duplicates.** Clone of a `SpeelEntity` subclass with `Created`/`Author`/`AuthorId` set, `delete Id`, `add()` → insert payload carries none of them; after save they are `undefined`. Test in Task 4.
- **Draft round-trip through `JSON.stringify`.** `deserialize(JSON.parse(JSON.stringify(serialize(e))))` equals the entity for Dates, Json shapes (with unknown keys) and navigations. Test in Task 5.
- **Hydration failure.** A stub whose target no longer exists (findAsync → null) stays a stub; the form does not throw. Test in Task 6.

---

### Task 1: `cloneValue` and the unloaded-navigation helper

**Files:**

- Create: `packages/speel-core/src/Entities/cloneValue.ts`
- Create: `packages/speel-core/src/Entities/navValue.ts`
- Test: `packages/speel-core/test/unit/Entities/cloneValue.test.ts`
- Test: `packages/speel-core/test/unit/Entities/navValue.test.ts`

**Interfaces:**

- Produces: `cloneValue(value: unknown): unknown` — deep copy of a property value: `Date` → new `Date`; arrays → new arrays (elements cloned); any other object → `Object.create(proto)` with every own property (string and symbol keys, enumerable or not) copied via its descriptor, data values cloned recursively. Primitives returned as-is. Never used on navigation targets.
- Produces: `isUnloadedNavValue(nav: INavigation, owner: Record<string, unknown>): boolean` — the rule in refinement 1, reading `owner[nav.name]` and, for self-side storage, `owner[nav.foreignKey.propertyName]`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/unit/Entities/cloneValue.test.ts
import { describe, it, expect } from "vitest";
import { cloneValue } from "../../../src/Entities/cloneValue.js";

class Shape {
  Title?: string;
}
const BAG = Symbol("bag");

describe("cloneValue", () => {
  it("copies Dates and arrays independently", () => {
    const d = new Date(2026, 0, 1);
    const arr = [d, 1];
    const out = cloneValue(arr) as [Date, number];
    expect(out).not.toBe(arr);
    expect(out[0]).not.toBe(d);
    expect(out[0].getTime()).toBe(d.getTime());
  });

  it("keeps a class instance's prototype and its non-enumerable symbol bag", () => {
    const s = Object.assign(new Shape(), { Title: "a" });
    Object.defineProperty(s, BAG, {
      value: { extra: 1 },
      enumerable: false,
      writable: true,
      configurable: true,
    });
    const out = cloneValue(s) as Shape & Record<symbol, unknown>;
    expect(out).toBeInstanceOf(Shape);
    expect(out).not.toBe(s);
    expect(out.Title).toBe("a");
    expect(out[BAG]).toEqual({ extra: 1 });
    expect(out[BAG]).not.toBe((s as unknown as Record<symbol, unknown>)[BAG]);
    expect(Object.keys(out)).toEqual(["Title"]);
  });

  it("returns primitives, null and undefined unchanged", () => {
    expect(cloneValue(3)).toBe(3);
    expect(cloneValue(null)).toBe(null);
    expect(cloneValue(undefined)).toBe(undefined);
  });
});
```

```ts
// test/unit/Entities/navValue.test.ts
import { describe, it, expect } from "vitest";
import { isUnloadedNavValue } from "../../../src/Entities/navValue.js";
import type { INavigation } from "../../../src/Metadata/Navigation.js";

const nav = (storage: INavigation["storage"]) =>
  ({
    name: "Program",
    storage,
    foreignKey: { propertyName: "ProgramId" },
  }) as unknown as INavigation;

describe("isUnloadedNavValue", () => {
  it("undefined is unloaded", () => {
    expect(isUnloadedNavValue(nav("self-fk-scalar"), {})).toBe(true);
  });
  it("null with a set FK is unloaded; null with an empty FK is an explicit empty", () => {
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), {
        Program: null,
        ProgramId: 9,
      }),
    ).toBe(true);
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), {
        Program: null,
        ProgramId: null,
      }),
    ).toBe(false);
    expect(
      isUnloadedNavValue(nav("self-fk-array"), {
        Program: null,
        ProgramId: [1],
      }),
    ).toBe(true);
    expect(
      isUnloadedNavValue(nav("self-fk-array"), {
        Program: null,
        ProgramId: [],
      }),
    ).toBe(false);
  });
  it("null on an inverse-fk navigation is unloaded; [] is an explicit empty", () => {
    expect(isUnloadedNavValue(nav("inverse-fk"), { Program: null })).toBe(true);
    expect(isUnloadedNavValue(nav("inverse-fk"), { Program: [] })).toBe(false);
  });
  it("a value is loaded", () => {
    expect(
      isUnloadedNavValue(nav("self-fk-scalar"), { Program: { Id: 1 } }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/unit/Entities` (in `packages/speel-core`)
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// src/Entities/cloneValue.ts
/**
 * A deep copy of a property value that keeps what a model value is made of: a
 * Json shape instance stays an instance of its class and keeps its non-enumerable,
 * symbol-keyed unknown-key bag (Snapshot's comparison clone deliberately flattens
 * both). Navigation targets never come through here — they are rows, shared by
 * reference, not values.
 */
export function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  const out = Object.create(Object.getPrototypeOf(value)) as object;
  for (const key of Reflect.ownKeys(value)) {
    const desc = Object.getOwnPropertyDescriptor(value, key)!;
    if ("value" in desc) desc.value = cloneValue(desc.value);
    Object.defineProperty(out, key, desc);
  }
  return out;
}
```

```ts
// src/Entities/navValue.ts
import type { INavigation } from "../Metadata/Navigation.js";

/**
 * Whether a navigation's value means "not loaded" rather than "empty". Entities
 * commonly initialize navigations to null, so null alone is ambiguous: it is
 * unloaded on an inverse-fk navigation (nothing on this side says otherwise) and
 * when this side's FK still points somewhere. [] and null-with-empty-FK are real
 * empties.
 */
export function isUnloadedNavValue(
  nav: INavigation,
  owner: Record<string, unknown>,
): boolean {
  const value = owner[nav.name];
  if (value === undefined) return true;
  if (value !== null) return false;
  if (nav.storage === "inverse-fk") return true;
  const fk = owner[nav.foreignKey.propertyName];
  return Array.isArray(fk) ? fk.length > 0 : fk != null;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run test/unit/Entities`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/src/Entities packages/speel-core/test/unit/Entities
git commit -m "feat(core): cloneValue and unloaded-navigation helpers"
```

---

### Task 2: `EntityEntry.setValues`

**Files:**

- Modify: `packages/speel-core/src/ChangeTracker/EntityEntry.ts` (add method after `currentValues`)
- Test: `packages/speel-core/test/unit/ChangeTracker/EntityEntry.setValues.test.ts`

**Interfaces:**

- Consumes: `cloneValue`, `isUnloadedNavValue` (Task 1).
- Produces: `EntityEntry<T>.setValues(source: Partial<T>): void`.

Semantics: for each model property — skip `key`, skip `readOnly`, skip keys not `in` source; assign `cloneValue(source[p])`. For each navigation — skip `readOnly`, skip not `in` source, skip `isUnloadedNavValue(nav, source)`; assign references as-is and collections as a new array of the same targets. `Deleted` → `InvalidOperationException`. State and snapshot untouched.

- [ ] **Step 1: Write the failing test**

```ts
// test/unit/ChangeTracker/EntityEntry.setValues.test.ts
import { it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { InvalidOperationException } from "../../../src/errors.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

class Program {
  Id?: number;
  Title: string | null = null;
  Projects: Project[] | null = null;
}
class Project {
  Id?: number;
  Title: string | null = null;
  Due: Date | null = null;
  Code: string | null = null; // read-only
  Program: Program | null = null;
  ProgramId: number | null = null;
}
class Ctx extends DbContext {
  programs = this.set(Program);
  projects = this.set(Project);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
      e.hasMany(Project, (x) => x.Projects).withOne((p) => p.Program);
    });
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((x) => x.Title).isText();
      e.property((x) => x.Due).isDateTime();
      e.property((x) => x.Code)
        .isText()
        .isReadOnly();
      e.hasOne(Program, (x) => x.Program).withMany((p) => p.Projects);
    });
  }
}
async function setup() {
  const provider = new FakeStorageProvider();
  provider.seedRow({ kind: "title", value: "Programs" }, { Title: "P1" });
  provider.seedRow({ kind: "title", value: "Programs" }, { Title: "P2" });
  provider.seedRow(
    { kind: "title", value: "Projects" },
    { Title: "A", ProgramId: 1, Code: "X" },
  );
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const project = (await ctx.projects.findAsync(1))!;
  return { ctx, project };
}

it("copies present writable properties, cloning values, and leaves state to detectChanges", async () => {
  const { ctx, project } = await setup();
  const due = new Date(2026, 5, 1);
  ctx.entry(project).setValues({ Title: "B", Due: due });
  expect(project.Title).toBe("B");
  expect(project.Due).not.toBe(due);
  expect(project.Due!.getTime()).toBe(due.getTime());
  expect(ctx.entry(project).state).toBe(EntityState.Unchanged);
  expect(ctx.entry(project).getDirtyColumns().sort()).toEqual(["Due", "Title"]);
});

it("skips the key and read-only properties", async () => {
  const { ctx, project } = await setup();
  ctx.entry(project).setValues({ Id: 99, Code: "Y" } as Partial<Project>);
  expect(project.Id).toBe(1);
  expect(project.Code).toBe("X");
});

it("a patch equal to the current values leaves nothing dirty", async () => {
  const { ctx, project } = await setup();
  ctx.entry(project).setValues({ Title: "A" });
  expect(ctx.entry(project).getDirtyColumns()).toEqual([]);
});

it("skips an unloaded navigation (null with FK set) and copies a loaded one", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Program)
    .loadAsync();
  const p1 = project.Program!;
  ctx.entry(project).setValues({ Program: null, ProgramId: 1 });
  expect(project.Program).toBe(p1);
  const p2 = (await ctx.programs.findAsync(2))!;
  ctx.entry(project).setValues({ Program: p2 });
  expect(project.Program).toBe(p2);
});

it("copies a collection as a new array of the same targets; skips inverse-fk null", async () => {
  const { ctx } = await setup();
  const program = (await ctx.programs.findAsync(1))!;
  await ctx
    .entry(program)
    .collection((p) => p.Projects)
    .loadAsync();
  const loaded = program.Projects!;
  ctx.entry(program).setValues({ Projects: null });
  expect(program.Projects).toBe(loaded);
  const next = [loaded[0]!];
  ctx.entry(program).setValues({ Projects: next });
  expect(program.Projects).not.toBe(next);
  expect(program.Projects![0]).toBe(loaded[0]);
});

it("throws on a Deleted entry", async () => {
  const { ctx, project } = await setup();
  ctx.projects.remove(project);
  expect(() => ctx.entry(project).setValues({ Title: "B" })).toThrow(
    InvalidOperationException,
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/unit/ChangeTracker/EntityEntry.setValues.test.ts`
Expected: FAIL — `setValues is not a function`.

- [ ] **Step 3: Implement** (in `EntityEntry`, after `currentValues`; add imports `cloneValue` from `../Entities/cloneValue.js`, `isUnloadedNavValue` from `../Entities/navValue.js`)

```ts
  /**
   * Copy another object's values onto this entry's entity — the way a scratch
   * copy (a clone, a deserialized draft) is applied back. Only keys present on
   * `source` are copied, so a partial patch works. The key and read-only members
   * are skipped silently (a clone legitimately carries them), as is a navigation
   * the source never loaded. Values are cloned on the way in; navigation targets
   * are rows and stay shared. State is left to detectChanges: if nothing actually
   * differs, nothing is sent.
   */
  setValues(source: Partial<T>): void {
    if (this.state === EntityState.Deleted) {
      throw new InvalidOperationException(
        `setValues() on ${this.entityType.ctor.name}: the entity is marked Deleted.`,
      );
    }
    const src = source as unknown as Record<string, unknown>;
    const e = this.entity as unknown as Record<string, unknown>;
    for (const p of this.entityType.properties) {
      if (p.key || p.readOnly || !(p.propertyName in src)) continue;
      e[p.propertyName] = cloneValue(src[p.propertyName]);
    }
    for (const nav of this.entityType.navigations()) {
      if (nav.readOnly || !(nav.name in src)) continue;
      if (isUnloadedNavValue(nav, src)) continue;
      const v = src[nav.name];
      e[nav.name] = Array.isArray(v) ? [...v] : v;
    }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/unit/ChangeTracker/EntityEntry.setValues.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/src/ChangeTracker/EntityEntry.ts packages/speel-core/test/unit/ChangeTracker/EntityEntry.setValues.test.ts
git commit -m "feat(core): EntityEntry.setValues applies a copy's writable values"
```

---

### Task 3: `DbSet.clone` and the `update()` fix

**Files:**

- Modify: `packages/speel-core/src/DbSet.ts` (`update`, new `clone`)
- Create: `packages/speel-core/src/Entities/cloneEntity.ts`
- Test: `packages/speel-core/test/unit/DbSet.clone.test.ts`

**Interfaces:**

- Consumes: `cloneValue` (Task 1), `EntityEntry.setValues` (Task 2).
- Produces: `cloneEntity<T>(et: EntityType<T>, entity: T): T`; `DbSet<T>.clone(entity: T): T`.

- [ ] **Step 1: Write the failing test** — reuse the `Program`/`Project`/`Ctx` model and `setup()` from Task 2 (copy them into this file), plus a decorated Json shape entity:

```ts
// test/unit/DbSet.clone.test.ts  (model + setup() copied from Task 2's test, then:)
import { Entity, JsonShape, TextField, JsonField } from "../../src/index.js";

@JsonShape()
class Step {
  @TextField() Title?: string;
}
@Entity({ list: "Flows" })
class Flow {
  Id?: number;
  @TextField() Title?: string;
  @JsonField({ of: () => Step }) Head?: Step;
}
class FlowCtx extends DbContext {
  flows = this.set(Flow);
}

it("clone copies every property incl. key and read-only, shares nav targets, stays untracked", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Program)
    .loadAsync();
  project.Due = new Date(2026, 0, 1);
  const copy = ctx.projects.clone(project);
  expect(copy).toBeInstanceOf(Project);
  expect(copy).not.toBe(project);
  expect(copy.Id).toBe(1);
  expect(copy.Code).toBe("X");
  expect(copy.Due).not.toBe(project.Due);
  expect(copy.Due!.getTime()).toBe(project.Due!.getTime());
  expect(copy.Program).toBe(project.Program);
  expect(ctx.changeTracker.entryFor(copy)).toBeUndefined();
  expect(ctx.entry(project).state).toBe(EntityState.Unchanged);
});

it("clone keeps a Json shape's class and unknown keys", async () => {
  const provider = new FakeStorageProvider();
  provider.seedRow(
    { kind: "title", value: "Flows" },
    { Title: "F", Head: JSON.stringify({ Title: "s", Extra: 1 }) },
  );
  const ctx = initSpeelDbContext(FlowCtx, (b) => b.useProvider(provider));
  const flow = (await ctx.flows.findAsync(1))!;
  const copy = ctx.flows.clone(flow);
  expect(copy.Head).toBeInstanceOf(Step);
  expect(copy.Head).not.toBe(flow.Head);
  expect(copy.Head!.Title).toBe("s");
});

it("update(clone) applies the clone's values to the tracked original and sends only changes", async () => {
  const { ctx, project } = await setup();
  const copy = ctx.projects.clone(project);
  ctx.entry(copy); // a form creates a Detached bookkeeping entry for what it shows
  copy.Title = "Renamed";
  const entry = ctx.projects.update(copy);
  expect(entry.entity).toBe(project);
  expect(project.Title).toBe("Renamed");
  expect(entry.getDirtyColumns()).toEqual(["Title"]);
});

it("update(clone) with no real change ends Unchanged at save", async () => {
  const { ctx, project } = await setup();
  ctx.projects.update(ctx.projects.clone(project));
  ctx.changeTracker.detectChanges();
  expect(ctx.entry(project).state).toBe(EntityState.Unchanged);
});

it("update(clone) revives a Deleted original", async () => {
  const { ctx, project } = await setup();
  ctx.projects.remove(project);
  const copy = ctx.projects.clone(project);
  copy.Title = "Back";
  ctx.projects.update(copy);
  expect(ctx.entry(project).state).toBe(EntityState.Modified);
  expect(project.Title).toBe("Back");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/unit/DbSet.clone.test.ts`
Expected: FAIL — `clone is not a function`; `update(clone)` leaves `project.Title` as "A".

- [ ] **Step 3: Implement**

```ts
// src/Entities/cloneEntity.ts
import type { EntityType } from "../Metadata/EntityType.js";
import { cloneValue } from "./cloneValue.js";

/**
 * A complete, untracked copy: every model property (key and read-only included)
 * deep-copied; navigations copied by reference — a collection gets a new array of
 * the same targets, because cloning a target would mint a second instance of a
 * tracked row.
 */
export function cloneEntity<T>(et: EntityType, entity: T): T {
  const src = entity as unknown as Record<string, unknown>;
  const out = new et.ctor() as unknown as Record<string, unknown>;
  for (const p of et.properties) {
    if (p.propertyName in src)
      out[p.propertyName] = cloneValue(src[p.propertyName]);
  }
  for (const nav of et.navigations()) {
    if (!(nav.name in src)) continue;
    const v = src[nav.name];
    out[nav.name] = Array.isArray(v) ? [...v] : v;
  }
  return out as unknown as T;
}
```

In `DbSet.ts` (import `cloneEntity` from `./Entities/cloneEntity.js`):

```ts
  /** A complete, untracked copy of `entity` — see {@link cloneEntity}. */
  clone(entity: T): T {
    return cloneEntity(this.entityType, entity);
  }
```

Replace the `if (existing) { entry = existing … }` branch of `update`:

```ts
    if (existing) {
      entry = existing as EntityEntry<T>;
      if (entry.entity !== entity) {
        // A different instance for a tracked row — a clone or a deserialized
        // draft. Its values are what the caller means to save; marking the
        // tracked entry alone would diff it against itself and send nothing.
        if (entry.state === EntityState.Deleted) entry.state = EntityState.Modified;
        entry.setValues(entity);
      }
    } else {
```

- [ ] **Step 4: Run to verify it passes, then the whole core suite**

Run: `npx vitest run test/unit/DbSet.clone.test.ts && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/src/Entities/cloneEntity.ts packages/speel-core/src/DbSet.ts packages/speel-core/test/unit/DbSet.clone.test.ts
git commit -m "feat(core): DbSet.clone; update() applies a different instance's values"
```

---

### Task 4: `add()` accepts read-only values; insert clears them

**Files:**

- Modify: `packages/speel-core/src/DbSet.ts` (the read-only loop in `add`)
- Modify: `packages/speel-core/src/Save/SaveExecutor.ts` (`reconcile` insert branch, `reconcileFileAdd`)
- Create: `packages/speel-core/src/Entities/readOnlyMembers.ts`
- Modify: `packages/speel-core/test/unit/DbSet.write.test.ts:82-87`
- Modify comments: `packages/speel-core/test/unit/ModelBuilder/decorators.test.ts:131`, `packages/speel-core/test/unit/ModelBuilder/readOnlyDeclaration.test-d.ts:24`
- Test: `packages/speel-core/test/unit/DbSet.addReadOnly.test.ts`

**Interfaces:**

- Produces: `readOnlyMembersWithValues(et: EntityType, entity: object): string[]` and `clearReadOnlyMembers(et: EntityType, entity: object): void` (sets read-only, non-key properties and read-only navigations to `undefined`).

- [ ] **Step 1: Write the failing tests**

In `DbSet.write.test.ts` replace the "add throws when a read-only property…" test with:

```ts
it("add warns about read-only values and tracks the entity anyway", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const b = new Blog();
  b.Title = "x";
  b.Created = new Date();
  const e = set.add(b);
  expect(e.state).toBe(EntityState.Added);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(String(warn.mock.calls[0]![0])).toContain("Created");
  warn.mockRestore();
});
```

(add `vi` to the vitest import.)

```ts
// test/unit/DbSet.addReadOnly.test.ts
import { it, expect, vi } from "vitest";
import {
  DbContext,
  initSpeelDbContext,
  Entity,
  Key,
  TextField,
  SpeelEntity,
} from "../../src/index.js";
import type { IBatchOperation } from "../../src/providers/ISharePointProvider.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

@Entity({ list: "Notes" })
class Note extends SpeelEntity {
  @Key override Id?: number = undefined;
  @TextField() Title: string | null = null;
}
class Ctx extends DbContext {
  notes = this.set(Note);
}

it("a duplicated SpeelEntity inserts without its system fields and clears them after save", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const original = Object.assign(new Note(), { Title: "A" });
  ctx.notes.add(original);
  await ctx.saveChangesAsync();

  const copy = ctx.notes.clone(original);
  Object.assign(copy, { Created: new Date(2020, 0, 1), AuthorId: 7 }); // what a loaded row carries
  delete copy.Id;
  ctx.notes.add(copy);
  const ops: IBatchOperation[] = [];
  const orig = provider.executeBatchAsync.bind(provider);
  provider.executeBatchAsync = async (batch) => {
    ops.push(...batch);
    return orig(batch);
  };
  await ctx.saveChangesAsync();

  const insert = ops.find((o) => o.kind === "insert")!;
  if (insert.kind !== "insert") throw new Error("expected insert");
  expect(insert.fields.map((f) => f.property.propertyName)).toEqual(["Title"]);
  expect(copy.Id).toBe(2);
  expect(copy.Created).toBeUndefined();
  expect(copy.AuthorId).toBeUndefined();
  expect(copy.Author).toBeUndefined();
  expect(copy.Title).toBe("A");
  expect(ctx.entry(copy).getDirtyColumns()).toEqual([]);
  vi.restoreAllMocks();
});
```

Add to `test/unit/DbSet.fileAdd.test.ts` (follow its existing setup for a document `add(doc, { file })`): set a read-only non-file member (e.g. `Created`) before `add`, save, then assert it is `undefined` while `FileLeafRef`/`FileRef` hold the server's file facts.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/unit/DbSet.write.test.ts test/unit/DbSet.addReadOnly.test.ts test/unit/DbSet.fileAdd.test.ts`
Expected: FAIL — add throws `InvalidOperationException`.

- [ ] **Step 3: Implement**

```ts
// src/Entities/readOnlyMembers.ts
import type { EntityType } from "../Metadata/EntityType.js";

/** Names of read-only (non-key) properties and read-only navigations holding a value. */
export function readOnlyMembersWithValues(
  et: EntityType,
  entity: object,
): string[] {
  const e = entity as Record<string, unknown>;
  const names: string[] = [];
  for (const p of et.properties)
    if (p.readOnly && !p.key && e[p.propertyName] != null)
      names.push(p.propertyName);
  for (const nav of et.navigations())
    if (nav.readOnly && e[nav.name] != null) names.push(nav.name);
  return names;
}

/**
 * Clear what a new row carried but the server did not take: read-only values are
 * never written, so after an insert they describe some other row. New rows are not
 * re-queried for these, so absent is the honest value.
 */
export function clearReadOnlyMembers(et: EntityType, entity: object): void {
  const e = entity as Record<string, unknown>;
  for (const p of et.properties)
    if (p.readOnly && !p.key) e[p.propertyName] = undefined;
  for (const nav of et.navigations()) if (nav.readOnly) e[nav.name] = undefined;
}
```

In `DbSet.add`, replace the throwing loop with:

```ts
const carried = readOnlyMembersWithValues(this.entityType, entity);
if (carried.length > 0) {
  // A duplicate legitimately carries its source's system fields for display.
  // They are never written (PayloadBuilder skips read-only columns) and are
  // cleared once the insert lands.
  console.warn(
    `add() on ${this.ctor.name}: read-only ${carried.join(", ")} will not be written.`,
  );
}
```

In `SaveExecutor.reconcile` insert branch, before `entry.refreshSnapshot()`:

```ts
clearReadOnlyMembers(entry.entityType, entry.entity as object);
```

In `reconcileFileAdd`, as the first statement after promoting the key and before the `Object.assign(... fileFactsPatch ...)`:

```ts
clearReadOnlyMembers(entry.entityType, entry.entity as object);
```

Update the two test comments to say add() warns (and never writes) rather than throws.

- [ ] **Step 4: Run to verify**

Run: `npx vitest run` (in `packages/speel-core`)
Expected: PASS. If an existing test asserted read-only values survive an insert, it was asserting the stale-values bug — update it to expect `undefined`.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/src packages/speel-core/test
git commit -m "feat(core): add() warns on read-only values; inserts clear them"
```

---

### Task 5: `serialize` / `deserialize` and `SerializedEntity<T, M>`

**Files:**

- Modify: `packages/speel-core/src/ModelBuilder/fieldTypes/shapeCodec.ts` (export object-level pair)
- Create: `packages/speel-core/src/Entities/SerializedEntity.ts` (types)
- Create: `packages/speel-core/src/Entities/serialize.ts`
- Modify: `packages/speel-core/src/DbSet.ts` (`serialize`, `deserialize`)
- Modify: `packages/speel-core/src/index.ts` (exports)
- Test: `packages/speel-core/test/unit/Entities/serialize.test.ts`
- Test: `packages/speel-core/test/unit/Entities/SerializedEntity.test-d.ts`

**Interfaces:**

- Consumes: `cloneValue` (Task 1).
- Produces (shapeCodec): `shapeToPlain(shape: EntityType, value: unknown): Record<string, unknown>` (the existing private `toPlain`, exported) and `shapeFromPlain(shape: EntityType, raw: unknown, propertyName: string): unknown` (the existing private `toInstance`, exported).
- Produces (types): `NavigationMode = "stub" | "full"`, `SerializedEntity<T, M extends NavigationMode = "stub">`, `ISerializeOptions<M> = { navigations?: M }`.
- Produces: `serializeEntity(et, entity, mode): Record<string, unknown>`, `deserializeEntity(et, data, resolveTracked: (ctor, id) => object | undefined): object`; `DbSet<T>.serialize<M extends NavigationMode = "stub">(entity: T, options?: ISerializeOptions<M>): SerializedEntity<T, M>`; `DbSet<T>.deserialize(data: SerializedEntity<T, NavigationMode>): T`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/unit/Entities/serialize.test.ts
import { it, expect } from "vitest";
import {
  DbContext,
  initSpeelDbContext,
  Entity,
  Key,
  JsonShape,
  TextField,
  DateTimeField,
  JsonField,
  MultiJsonField,
  ManyToOne,
  OneToMany,
  DataException,
} from "../../../src/index.js";
import type { SerializedEntity } from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";

@JsonShape()
class Step {
  @TextField() Title?: string;
  @DateTimeField() At?: Date;
}

@Entity({ list: "Departments" })
class Department {
  @Key Id?: number = undefined;
  @TextField() Title: string | null = null;
  @OneToMany(() => Project, { inverse: "Department" }) Projects:
    Project[] | null = null;
}
@Entity({ list: "Projects" })
class Project {
  @Key Id?: number = undefined;
  @TextField() Title: string | null = null;
  @DateTimeField() Due: Date | null = null;
  @JsonField({ of: () => Step }) Head?: Step = undefined;
  @MultiJsonField({ of: () => Step }) Steps?: Step[] = undefined;
  @ManyToOne(() => Department) Department: Department | null = null;
  DepartmentId: number | null = null;
}
class Ctx extends DbContext {
  departments = this.set(Department);
  projects = this.set(Project);
}

const DEPTS = { kind: "title", value: "Departments" } as const;
const PROJS = { kind: "title", value: "Projects" } as const;
async function setup() {
  const provider = new FakeStorageProvider();
  provider.seedRow(DEPTS, { Title: "Ops" });
  provider.seedRow(PROJS, {
    Title: "A",
    Due: new Date(Date.UTC(2026, 0, 2)),
    DepartmentId: 1,
    Head: JSON.stringify({ Title: "h", Extra: 1 }),
    Steps: JSON.stringify([{ Title: "s1", At: "2026-01-03T00:00:00.000Z" }]),
  });
  const fresh = () => initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const ctx = fresh();
  const project = (await ctx.projects.findAsync(1))!;
  return { ctx, project, fresh };
}

it("stub mode: dates as ISO, shapes as plain objects with unknown keys, navs as { Id }", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  const data = ctx.projects.serialize(project);
  expect(data.Due).toBe("2026-01-02T00:00:00.000Z");
  expect(data.Head).toEqual({ Title: "h", Extra: 1 });
  expect(data.Steps).toEqual([{ Title: "s1", At: "2026-01-03T00:00:00.000Z" }]);
  expect(data.Department).toEqual({ Id: 1 });
  expect(data.DepartmentId).toBe(1);
  expect(JSON.parse(JSON.stringify(data))).toEqual(data);
});

it("full mode serializes loaded targets one level deep; their navs are stubs or omitted", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  const dept = project.Department!;
  await ctx
    .entry(dept)
    .collection((d) => d.Projects)
    .loadAsync(); // cycle back to project
  const data = ctx.projects.serialize(project, { navigations: "full" });
  expect(data.Department).toEqual({
    Id: 1,
    Title: "Ops",
    Projects: [{ Id: 1 }],
  });
});

it("round-trips through JSON into an untracked entity; tracked targets win", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  const json = JSON.stringify(
    ctx.projects.serialize(project, { navigations: "full" }),
  );
  const back = ctx.projects.deserialize(JSON.parse(json));
  expect(back).toBeInstanceOf(Project);
  expect(back).not.toBe(project);
  expect(ctx.changeTracker.entryFor(back)).toBeUndefined();
  expect(back.Due).toEqual(project.Due);
  expect(back.Head).toBeInstanceOf(Step);
  expect(ctx.projects.serialize(back).Head).toEqual({ Title: "h", Extra: 1 });
  expect(back.Steps![0]!.At).toBeInstanceOf(Date);
  expect(back.Department).toBe(project.Department); // tracked instance, not a copy
});

it("an untracked stub becomes a bare target; an untracked full target is materialized", async () => {
  const { ctx, fresh } = await setup();
  const other = fresh();
  const stub = other.projects.deserialize({
    Id: 1,
    Department: { Id: 1 },
  } as SerializedEntity<Project>);
  expect(stub.Department).toBeInstanceOf(Department);
  expect(stub.Department!.Id).toBe(1);
  expect(stub.Department!.Title).toBeNull();
  const full = other.projects.deserialize({
    Id: 1,
    Department: { Id: 1, Title: "Ops" },
  } as never);
  expect(full.Department!.Title).toBe("Ops");
  void ctx;
});

it("missing keys stay absent, unknown keys are ignored, bad input throws", async () => {
  const { ctx } = await setup();
  const p = ctx.projects.deserialize({ Title: "x", Bogus: 1 } as never);
  expect(p.Title).toBe("x");
  expect((p as unknown as Record<string, unknown>).Bogus).toBeUndefined();
  expect(() => ctx.projects.deserialize("nope" as never)).toThrow(
    DataException,
  );
  expect(() =>
    ctx.projects.deserialize({ Due: "not a date" } as never),
  ).toThrow(DataException);
});
```

Also add to `DbSet.clone.test.ts` (Task 3) the shape-bag survival assertion: `expect(ctx.flows.serialize(ctx.flows.clone(flow)).Head).toEqual({ Title: "s", Extra: 1 })`.

```ts
// test/unit/Entities/SerializedEntity.test-d.ts
import { expectTypeOf, it } from "vitest";
import type { SerializedEntity } from "../../../src/index.js";

class Step {
  Title?: string;
  At?: Date;
}
class Department {
  Id?: number;
  Title: string | null = null;
  Projects: Project[] | null = null;
}
class Project {
  Id?: number;
  readonly Created?: Date;
  Title: string | null = null;
  Head?: Step;
  Steps?: Step[];
  Department: Department | null = null;
  DepartmentId: number | null = null;
  describe(): string {
    return "";
  }
}

it("maps values, stubs navigations, drops methods and readonly", () => {
  type S = SerializedEntity<Project>;
  expectTypeOf<S["Created"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<S["Title"]>().toEqualTypeOf<string | null>();
  expectTypeOf<S["Head"]>().toEqualTypeOf<
    { Title?: string; At?: string } | undefined
  >();
  expectTypeOf<S["Department"]>().toEqualTypeOf<{ Id: number } | null>();
  expectTypeOf<S>().not.toHaveProperty("describe");
});

it("full mode types loaded targets as stub-mode serialized entities", () => {
  type F = SerializedEntity<Project, "full">;
  expectTypeOf<NonNullable<F["Department"]>>().toEqualTypeOf<
    SerializedEntity<Department, "stub"> | { Id: number }
  >();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/unit/Entities && npx vitest --typecheck.only run test/unit/Entities` (use the package's existing typecheck script if it differs — see `package.json`)
Expected: FAIL — `serialize is not a function`; type not exported.

- [ ] **Step 3: Implement**

`shapeCodec.ts`: rename nothing; add after `shapeCodec`:

```ts
/** A shape instance → the plain object speel's JSON holds (unknown keys merged back). */
export function shapeToPlain(
  shape: EntityType,
  value: unknown,
): Record<string, unknown> {
  return toPlain(shape, value);
}
/** speel's JSON object → a fresh shape instance (unknown keys kept in the bag). */
export function shapeFromPlain(
  shape: EntityType,
  raw: unknown,
  propertyName: string,
): unknown {
  return toInstance(shape, raw, propertyName);
}
```

```ts
// src/Entities/SerializedEntity.ts
/** How serialize writes navigations: `{ Id }` stubs, or loaded targets in full (one level). */
export type NavigationMode = "stub" | "full";

export interface ISerializeOptions<M extends NavigationMode = "stub"> {
  navigations?: M;
}

type SerializedValue<V, M extends NavigationMode> = V extends Date
  ? string
  : V extends readonly (infer U)[]
    ? SerializedValue<U, M>[]
    : V extends object
      ? "Id" extends keyof V
        ? M extends "full"
          ? SerializedEntity<V, "stub"> | { Id: number }
          : { Id: number }
        : { -readonly [K in keyof V]: SerializedValue<V[K], "stub"> }
      : V;

/**
 * An entity as plain, JSON-safe data with the entity's own keys: DateTimes as ISO
 * strings, Json shapes as plain objects, navigations as `{ Id }` stubs (or, with
 * `"full"`, loaded targets serialized one level deep).
 */
export type SerializedEntity<T, M extends NavigationMode = "stub"> = {
  -readonly [
    K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K
  ]: SerializedValue<T[K], M>;
};
```

```ts
// src/Entities/serialize.ts
import type { EntityType } from "../Metadata/EntityType.js";
import type { Property } from "../Metadata/Property.js";
import type { JsonFieldConfig } from "../Metadata/FieldConfig.js";
import type { EntityCtor } from "../types.js";
import { DataException } from "../errors.js";
import {
  shapeToPlain,
  shapeFromPlain,
} from "../ModelBuilder/fieldTypes/shapeCodec.js";
import { cloneValue } from "./cloneValue.js";
import type { NavigationMode } from "./SerializedEntity.js";

export type ResolveTracked = (
  ctor: EntityCtor,
  id: number,
) => object | undefined;

const each = (v: unknown, f: (x: unknown) => unknown): unknown =>
  Array.isArray(v) ? v.map(f) : f(v);

function writeValue(p: Property, v: unknown): unknown {
  if (v == null) return v;
  if (p.config.kind === "Json") {
    const shape = (p.config as JsonFieldConfig).shape;
    return each(v, (x) => shapeToPlain(shape, x));
  }
  const toWire = p.codec?.toWire;
  return toWire ? each(v, (x) => toWire(x)) : cloneValue(v);
}

function readValue(p: Property, v: unknown): unknown {
  if (v == null) return v;
  if (p.config.kind === "Json") {
    const shape = (p.config as JsonFieldConfig).shape;
    return each(v, (x) => shapeFromPlain(shape, x, p.propertyName));
  }
  const fromWire = p.codec?.fromWire;
  return fromWire ? each(v, (x) => fromWire(x)) : cloneValue(v);
}

const idOf = (target: unknown): number | undefined => {
  const id = (target as { Id?: number | null } | null)?.Id;
  return id == null || id === 0 ? undefined : id;
};

export function serializeEntity(
  et: EntityType,
  entity: object,
  mode: NavigationMode,
): Record<string, unknown> {
  const src = entity as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const p of et.properties) {
    const v = src[p.propertyName];
    if (v !== undefined) out[p.propertyName] = writeValue(p, v);
  }
  for (const nav of et.navigations()) {
    const v = src[nav.name];
    if (v === undefined) continue;
    const target = (t: unknown): Record<string, unknown> | undefined => {
      const id = idOf(t);
      if (id === undefined) return undefined;
      return mode === "full"
        ? serializeEntity(nav.target, t as object, "stub")
        : { Id: id };
    };
    out[nav.name] =
      v === null
        ? null
        : Array.isArray(v)
          ? v.map(target).filter((x) => x !== undefined)
          : (target(v) ?? null);
  }
  return out;
}

export function deserializeEntity(
  et: EntityType,
  data: unknown,
  resolveTracked: ResolveTracked,
): object {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new DataException(
      `deserialize() on ${et.ctor.name}: expected an object.`,
    );
  }
  const src = data as Record<string, unknown>;
  const out = new et.ctor() as unknown as Record<string, unknown>;
  for (const p of et.properties) {
    if (p.propertyName in src)
      out[p.propertyName] = readValue(p, src[p.propertyName]);
  }
  for (const nav of et.navigations()) {
    if (!(nav.name in src)) continue;
    const v = src[nav.name];
    const target = (t: unknown): object => {
      const id = idOf(t);
      if (typeof t !== "object" || id === undefined) {
        throw new DataException(
          `deserialize() on ${et.ctor.name}: navigation '${nav.name}' needs objects with an Id.`,
        );
      }
      const tracked = resolveTracked(nav.target.ctor, id);
      if (tracked) return tracked;
      if (Object.keys(t as object).length === 1) {
        const bare = new nav.target.ctor() as { Id?: number };
        bare.Id = id;
        return bare;
      }
      return deserializeEntity(nav.target, t, resolveTracked);
    };
    out[nav.name] =
      v === null ? null : Array.isArray(v) ? v.map(target) : target(v);
  }
  return out;
}
```

`DbSet.ts` (imports `serializeEntity`, `deserializeEntity` from `./Entities/serialize.js`; types from `./Entities/SerializedEntity.js`):

```ts
  /**
   * The entity as plain, JSON-safe data — for drafts, storage and postMessage.
   * Navigations are `{ Id }` stubs unless `navigations: "full"`.
   */
  serialize<M extends NavigationMode = "stub">(
    entity: T,
    options?: ISerializeOptions<M>,
  ): SerializedEntity<T, M> {
    return serializeEntity(this.entityType, entity, options?.navigations ?? "stub") as SerializedEntity<T, M>;
  }

  /**
   * Serialized data → an untracked entity. A navigation target this context
   * already tracks resolves to the tracked instance; otherwise a stub becomes a
   * bare instance carrying only its Id.
   */
  deserialize(data: SerializedEntity<T, NavigationMode>): T {
    return deserializeEntity(this.entityType, data, (ctor, id) => {
      const entry = this.tracker.findEntry(ctor, id);
      return entry && entry.state !== EntityState.Detached ? (entry.entity as object) : undefined;
    }) as T;
  }
```

`index.ts`, next to the DbSet exports:

```ts
export type {
  SerializedEntity,
  NavigationMode,
  ISerializeOptions,
} from "./Entities/SerializedEntity.js";
```

- [ ] **Step 4: Run to verify**

Run: `npx vitest run && npm run typecheck --if-present` (in `packages/speel-core`; use whatever script runs the `.test-d.ts` files — check `package.json`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/speel-core/src packages/speel-core/test
git commit -m "feat(core): serialize/deserialize with typed SerializedEntity<T, M>"
```

---

### Task 6: `useEntityForm` hydrates untracked navigation targets

**Files:**

- Modify: `packages/speel-react/src/form/useEntityForm.tsx` (the navigation-load effect)
- Test: `packages/speel-react/test/useEntityForm.navLoading.test.tsx` (append)

**Interfaces:**

- Consumes: `DbContext.changeTracker.findEntry(ctor, id)`, `DbContext.set(ctor).findAsync(id)`.

- [ ] **Step 1: Write the failing tests** (append; reuse the file's `Program`/`Project`/`Ctx`/`renderForm`):

```tsx
it("hydrates an untracked reference stub into the tracked target", async () => {
  const provider = makeFakeProvider({ Programs: [{ ID: 9, Title: "Alpha" }] });
  const ctx = new Ctx({ provider } as never);
  const stub = Object.assign(new Program(), { Id: 9 });
  const proj = Object.assign(new Project(), {
    Title: "Draft",
    ProgramId: 9,
    Program: stub,
  });

  const values = renderForm(ctx, proj);

  await waitFor(() => {
    expect((values().Program as Program).Title).toBe("Alpha");
  });
  expect(proj.Program).toBe(stub); // the entity is untouched until submit
});

it("hydrates untracked collection elements, keeping membership", async () => {
  const provider = makeFakeProvider({
    Projects: [
      { ID: 1, Title: "A", ProgramId: 9 },
      { ID: 2, Title: "B", ProgramId: 9 },
    ],
  });
  const ctx = new Ctx({ provider } as never);
  const prog = Object.assign(new Program(), {
    Id: 9,
    OwnedProjects: [Object.assign(new Project(), { Id: 2 })], // draft removed project 1
  });

  const values = renderForm(ctx, prog);

  await waitFor(() => {
    expect((values().OwnedProjects as Project[]).map((p) => p.Title)).toEqual([
      "B",
    ]);
  });
});

it("keeps a stub whose target no longer exists", async () => {
  const provider = makeFakeProvider({ Programs: [] });
  const ctx = new Ctx({ provider } as never);
  const stub = Object.assign(new Program(), { Id: 404 });
  const proj = Object.assign(new Project(), {
    Title: "Draft",
    ProgramId: 404,
    Program: stub,
    Sponsor: null,
  });

  const values = renderForm(ctx, proj);

  await waitFor(() => {
    expect("Sponsor" in values()).toBe(true); // effect ran past Program
  });
  expect(values().Program).toBe(stub);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/useEntityForm.navLoading.test.tsx` (in `packages/speel-react`; rebuild core dist first: `npm run build -w @speel/core` from the repo root)
Expected: FAIL — Title stays undefined (the stub is skipped).

- [ ] **Step 3: Implement** — in the effect, replace

```ts
if (form.store.state.values[nav.name] != null) continue;
```

with

```ts
const current = form.store.state.values[nav.name];
if (current != null) {
  // A value the user picked is tracked. An untracked target — a stub from
  // deserialize(), a target only a draft knows — has no display data, so
  // swap it for the tracked row by id. Membership is the draft's and is
  // kept; reloading the navigation would replace it with server state.
  const hydrated = await hydrateTargets(ctx, nav.target.ctor, current);
  if (!live) return;
  if (hydrated !== current) form.setFieldValue(nav.name, hydrated as never);
  continue;
}
```

and add, at module level in `useEntityForm.tsx`:

```ts
/**
 * Replace untracked targets in a navigation value with the tracked instance for
 * the same id (loading it if needed). Answers the same value when nothing
 * changed; a target that cannot be found stays as it is.
 */
async function hydrateTargets(
  ctx: DbContext,
  ctor: EntityCtor,
  value: unknown,
): Promise<unknown> {
  const one = async (t: unknown): Promise<unknown> => {
    const id = (t as { Id?: number } | null)?.Id;
    if (id == null || id === 0) return t;
    const tracked = ctx.changeTracker.findEntry(ctor, id);
    if (tracked && tracked.entity === t) return t;
    try {
      return (await ctx.set(ctor).findAsync(id)) ?? t;
    } catch {
      return t;
    }
  };
  if (Array.isArray(value)) {
    const next = await Promise.all(value.map(one));
    return next.every((x, i) => x === value[i]) ? value : next;
  }
  return one(value);
}
```

(Import `DbContext`/`EntityCtor` types from `@speel/core` if not already imported; match the existing import block.)

- [ ] **Step 4: Run to verify**

Run: `npx vitest run` (in `packages/speel-react`)
Expected: PASS, including the existing "skip-guard" test (a tracked value is still skipped — `findEntry(...).entity === t`).

- [ ] **Step 5: Commit**

```bash
git add packages/speel-react/src/form/useEntityForm.tsx packages/speel-react/test/useEntityForm.navLoading.test.tsx
git commit -m "fix(react): forms hydrate untracked navigation targets instead of skipping them"
```

---

### Task 7: Changeset, docs delta, full gates

**Files:**

- Create: `.changeset/entity-clone-serialize.md`
- Modify: `packages/speel-core/docs/saving.md` (or create `packages/speel-core/docs/entities.md` + README TOC line if `saving.md` would exceed 250 lines)
- Modify: `packages/speel-react/docs/forms.md` (only if it describes navigation loading)
- Modify: `docs/superpowers/specs/2026-10-06-entity-copy-serialize-design.md` (record the four refinements)

- [ ] **Step 1: Changeset**

```md
---
"@speel/core": minor
"@speel/react": minor
---

Entities: `DbSet.clone`, `serialize`/`deserialize` with `SerializedEntity<T, M>`, and `EntityEntry.setValues`. `update()` with a different instance for a tracked row now applies its values (previously they were silently dropped). `add()` warns about read-only values instead of throwing, and inserts clear them. Forms hydrate untracked navigation targets.
```

- [ ] **Step 2: Docs** — read `packages/speel-core/src/index.ts` exports first (never from memory). In `saving.md`: Capabilities gains duplicate/apply-back (clone → delete `Id` → `add`; clone → `update` / `entry.setValues`), read-only values on add; Boundaries gains "delete `Id` before `add()`", "read-only values are cleared after insert, not re-read", "a null navigation with its FK set counts as not loaded". Clone/serialize either as a Capabilities subsection (if ≤ 250 lines) or a new `entities.md` topic page with the four H2s and a README TOC line `- [Entities](docs/entities.md) — read when copying, duplicating or serializing entities.` Mark serialize format `> Stability: still settling.`

- [ ] **Step 3: Gates**

Run (repo root): `npm run verify` (or the CI `verify` script set: build, typecheck, test, `check:node-esm`, lint, prettier check), then the SPFx sample `heft build` (`npm run build` in `samples/spfx-sample`).
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add .changeset packages/speel-core/docs packages/speel-core/README.md packages/speel-react/docs docs/superpowers/specs
git commit -m "docs: entity clone/serialize/setValues; changeset"
```
