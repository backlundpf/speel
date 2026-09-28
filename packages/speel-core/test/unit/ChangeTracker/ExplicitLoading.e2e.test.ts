import { it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
} from "../../../src/index.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IListHandle } from "../../../src/types.js";

class Program {
  Id?: number;
  Title: string | null = null;
  OwnedProjects: Project[] | null = null;
}
class Project {
  Id?: number;
  Title: string | null = null;
  Program: Program | null = null;
  ProgramId: number | null = null;
}

class Ctx extends DbContext {
  public programs = this.set(Program);
  public projects = this.set(Project);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
      e.hasMany(Project, (x) => x.OwnedProjects).withOne((p) => p.Program);
    });
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((x) => x.Title).isText();
      e.hasOne(Program, (x) => x.Program).withMany((p) => p.OwnedProjects);
    });
  }
}

const projectsHandle: IListHandle = { kind: "title", value: "Projects" };
const programsHandle: IListHandle = { kind: "title", value: "Programs" };

async function seed() {
  const provider = new FakeStorageProvider();
  provider.seedRow(programsHandle, { Title: "Alpha" });
  provider.seedRow(projectsHandle, { Title: "One", ProgramId: 1 });
  provider.seedRow(projectsHandle, { Title: "Two", ProgramId: 1 });
  return provider;
}

it("loads an inverse collection on demand", async () => {
  const provider = await seed();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);

  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  expect(handle.isLoaded).toBe(false);

  await handle.loadAsync();

  expect(handle.isLoaded).toBe(true);
  expect(handle.currentValue.map((p) => p.Title).sort()).toEqual([
    "One",
    "Two",
  ]);
});

it("loads a reference on demand", async () => {
  const provider = await seed();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const project = await ctx.projects.findAsync(1);

  await ctx
    .entry(project!)
    .reference<Program>((p) => p.Program)
    .loadAsync();

  expect(project!.Program?.Title).toBe("Alpha");
});

it("a reference with a null FK loads nothing but is still marked loaded", async () => {
  const provider = new FakeStorageProvider();
  provider.seedRow(projectsHandle, { Title: "Orphan" });
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const project = await ctx.projects.findAsync(1);

  const handle = ctx.entry(project!).reference<Program>((p) => p.Program);
  await handle.loadAsync();

  expect(handle.currentValue).toBeUndefined();
  expect(handle.isLoaded).toBe(true);
});

// This test's assertion passes even with markNavLoaded disabled: the reconciled FK
// equals the value the child already has, so ChangeTracker.detectChanges() finds no
// dirty column and no write is queued — a separate, value-equality safety net absorbs
// it. That net does not cover every case: it cannot tell "this membership was always
// here" apart from "this membership just changed back to what it was". So this test
// does not, on its own, cover the markNavLoaded regression Task 3 exists to prevent —
// it would only catch a *different* regression, namely fixupInverseAsync writing
// unconditionally instead of relying on the dirty-diff gate. The case that actually
// depends on captureInverseOriginals() reading the real baseline (rather than an empty
// one) is below.
it("a scalar-only edit after a collection load does not trigger a same-value child FK rewrite", async () => {
  const provider = await seed();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  await ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects)
    .loadAsync();

  // A scalar edit on the parent only. The loaded children must not be treated
  // as newly-added membership and re-parented.
  program!.Title = "Alpha renamed";
  const seqBefore = provider.modificationCountFor(projectsHandle, 1);
  await ctx.saveChangesAsync();

  expect(provider.modificationCountFor(projectsHandle, 1)).toBe(seqBefore);
});

// The case that actually depends on captureInverseOriginals() reading the real load
// baseline: a genuine membership *change* after the load — detach a loaded child and
// confirm it, and only it, gets its FK cleared and written. Without markNavLoaded, the
// empty baseline makes every current member look "added" (a same-value no-op, invisible
// above) and NOTHING look "removed" (nothing is outside an empty original set), so the
// detach is silently dropped — the removed child keeps its stale FK and no write happens
// for it either. This is the assertion that goes red if markNavLoaded regresses.
it("REGRESSION: a child detached from a loaded collection is re-parented (FK nulled) at save", async () => {
  const provider = await seed();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  await handle.loadAsync();

  // Detach the loaded 'Two' from the in-memory collection — no direct edit to the
  // child, no FK assignment; only the parent's membership array changes.
  const kept = handle.currentValue.find((p) => p.Title === "One")!;
  const detached = handle.currentValue.find((p) => p.Title === "Two")!;
  program!.OwnedProjects = [kept];

  const keptSeqBefore = provider.modificationCountFor(projectsHandle, kept.Id!);
  const detachedSeqBefore = provider.modificationCountFor(
    projectsHandle,
    detached.Id!,
  );
  await ctx.saveChangesAsync();

  expect(detached.ProgramId).toBeNull();
  expect(
    provider.modificationCountFor(projectsHandle, detached.Id!),
  ).toBeGreaterThan(detachedSeqBefore);
  // The untouched member was never re-written.
  expect(provider.modificationCountFor(projectsHandle, kept.Id!)).toBe(
    keptSeqBefore,
  );
});

// --- Scope addition: kind: 'reference' + storage: 'inverse-fk' through the handles. ---
// A one-to-one where the FK lives on the OTHER entity (Employee.Badge, FK is Badge.EmployeeId).
// This is the combination the handle routing must treat as a single object, never a
// one-element array, and where a no-match must yield undefined, not [].

class Employee {
  Id?: number;
  Name: string | null = null;
  Badge: Badge | null = null;
}
class Badge {
  Id?: number;
  Code: string | null = null;
  Employee: Employee | null = null;
}

class OneToOneCtx extends DbContext {
  public employees = this.set(Employee);
  public badges = this.set(Badge);
  protected onModelCreating(b: ModelBuilder): void {
    b.entity(Employee, (e) => {
      e.toList("Employees");
      e.property((x) => x.Name).isText();
      e.hasOne(Badge, (x) => x.Badge).withOne((bg) => bg.Employee);
    });
    b.entity(Badge, (e) => {
      e.toList("Badges");
      e.property((x) => x.Code).isText();
    });
  }
}

const employeesHandle: IListHandle = { kind: "title", value: "Employees" };
const badgesHandle: IListHandle = { kind: "title", value: "Badges" };

it("loads a reference whose FK lives on the other entity (inverse-fk) as a single object", async () => {
  const provider = new FakeStorageProvider();
  provider.seedRow(employeesHandle, { Name: "Ada" });
  provider.seedRow(employeesHandle, { Name: "Grace" });
  provider.seedRow(badgesHandle, { Code: "BADGE-1", EmployeeId: 1 });
  const ctx = initSpeelDbContext(OneToOneCtx, (b) => b.useProvider(provider));

  const ada = await ctx.employees.findAsync(1);
  const handle = ctx.entry(ada!).reference<Badge>((e) => e.Badge);
  await handle.loadAsync();

  expect(Array.isArray(handle.currentValue)).toBe(false);
  expect(handle.currentValue?.Code).toBe("BADGE-1");
  expect(handle.isLoaded).toBe(true);

  const grace = await ctx.employees.findAsync(2);
  const handle2 = ctx.entry(grace!).reference<Badge>((e) => e.Badge);
  await handle2.loadAsync();

  expect(handle2.currentValue).toBeUndefined();
  expect(handle2.isLoaded).toBe(true);
});

// REGRESSION: the inverse passes (captureInverseOriginals / fixupInverseAsync) select
// navigations by storage alone, so a kind:'reference' + storage:'inverse-fk' nav — whose
// nav id is a SCALAR, not an array — flows through code that assumed number[]. Before the
// fix, `currentIds.filter is not a function` crashed the very next save, whatever it was
// for: an unrelated scalar edit was enough. Every case below therefore SAVES after loading.
async function seedOneToOne(): Promise<FakeStorageProvider> {
  const provider = new FakeStorageProvider();
  provider.seedRow(employeesHandle, { Name: "Ada" });
  provider.seedRow(badgesHandle, { Code: "BADGE-1", EmployeeId: 1 });
  return provider;
}

it("REGRESSION: saving after loading a reference stored inverse-fk does not throw", async () => {
  const provider = await seedOneToOne();
  const ctx = initSpeelDbContext(OneToOneCtx, (b) => b.useProvider(provider));
  const ada = await ctx.employees.findAsync(1);
  await ctx
    .entry(ada!)
    .reference<Badge>((e) => e.Badge)
    .loadAsync();

  // An unrelated scalar edit — nothing to do with the navigation.
  ada!.Name = "Ada Lovelace";
  const badgeSeqBefore = provider.modificationCountFor(badgesHandle, 1);
  await expect(ctx.saveChangesAsync()).resolves.toBeGreaterThan(0);

  // ...and the untouched, still-attached badge was not re-written.
  expect(provider.modificationCountFor(badgesHandle, 1)).toBe(badgeSeqBefore);
});

it("REGRESSION: clearing a loaded reference stored inverse-fk nulls the child FK at save", async () => {
  const provider = await seedOneToOne();
  const ctx = initSpeelDbContext(OneToOneCtx, (b) => b.useProvider(provider));
  const ada = await ctx.employees.findAsync(1);
  const handle = ctx.entry(ada!).reference<Badge>((e) => e.Badge);
  await handle.loadAsync();
  const badge = handle.currentValue!;

  ada!.Badge = null;
  await ctx.saveChangesAsync();

  expect(
    (badge as unknown as { EmployeeId?: number | null }).EmployeeId ?? null,
  ).toBeNull();
  const saved = await provider.getItemsByIdsAsync(
    badgesHandle,
    [1],
    ["EmployeeId"],
  );
  expect(
    (saved[0] as { EmployeeId?: number | null }).EmployeeId ?? null,
  ).toBeNull();
});

it("REGRESSION: assigning a reference stored inverse-fk sets the child FK at save", async () => {
  const provider = new FakeStorageProvider();
  provider.seedRow(employeesHandle, { Name: "Ada" });
  provider.seedRow(badgesHandle, { Code: "BADGE-1" });
  const ctx = initSpeelDbContext(OneToOneCtx, (b) => b.useProvider(provider));
  const ada = await ctx.employees.findAsync(1);
  const handle = ctx.entry(ada!).reference<Badge>((e) => e.Badge);
  await handle.loadAsync();
  expect(handle.currentValue).toBeUndefined();

  const badge = await ctx.badges.findAsync(1);
  ada!.Badge = badge;
  await ctx.saveChangesAsync();

  const saved = await provider.getItemsByIdsAsync(
    badgesHandle,
    [1],
    ["EmployeeId"],
  );
  expect((saved[0] as { EmployeeId?: number }).EmployeeId).toBe(1);
});
