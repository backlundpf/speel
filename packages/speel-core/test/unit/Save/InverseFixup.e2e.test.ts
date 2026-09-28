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

it("re-parents children to a newly-created parent (two-phase)", async () => {
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  // Pre-seed a child in the Projects list so it can be looked up by id
  provider.seedRow(projectsHandle, { Title: "X" });
  // Attach the existing child as Unchanged (id=1 from the seed above)
  const child = Object.assign(new Project(), { Id: 1, Title: "X" });
  ctx.set(Project).attach(child);
  // Create a new parent (no id yet) and include the child
  const prog = new Program();
  prog.Title = "New Program";
  prog.OwnedProjects = [child];
  ctx.set(Program).add(prog);
  await ctx.saveChangesAsync();
  // After save, prog.Id should have been assigned and child.ProgramId should match
  const saved = await provider.getItemsByIdsAsync(
    projectsHandle,
    [1],
    ["ProgramId"],
  );
  expect((saved[0] as { ProgramId?: number }).ProgramId).toBe(prog.Id);
});

it("runs the inverse pass on a membership-only edit (parent otherwise unchanged)", async () => {
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  // Pre-seed both the parent and child
  provider.seedRow(programsHandle, { Title: "P" });
  provider.seedRow(projectsHandle, { Title: "C" });
  // Attach a tracked Program with an empty OwnedProjects snapshot; do not change its columns
  const prog = Object.assign(new Program(), {
    Id: 1,
    Title: "P",
    OwnedProjects: [],
  });
  ctx.set(Program).attach(prog);
  const child = Object.assign(new Project(), { Id: 1, Title: "C" });
  ctx.set(Project).attach(child);
  // Membership-only change — the program's scalar columns are untouched
  prog.OwnedProjects = [child];
  await ctx.saveChangesAsync();
  const saved = await provider.getItemsByIdsAsync(
    projectsHandle,
    [1],
    ["ProgramId"],
  );
  expect((saved[0] as { ProgramId?: number }).ProgramId).toBe(1);
});

it("re-parents on a membership change even when the parent also has a column change", async () => {
  // C1 regression: an existing parent flushed in pass 1 has its snapshot refreshed by
  // reconcile() BEFORE the inverse pass runs. If originals are read after that refresh,
  // the membership diff is empty and the child is silently never re-parented.
  const provider = new FakeStorageProvider();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  provider.seedRow(programsHandle, { Title: "P" });
  provider.seedRow(projectsHandle, { Title: "C" });
  const prog = Object.assign(new Program(), {
    Id: 1,
    Title: "P",
    OwnedProjects: [],
  });
  ctx.set(Program).attach(prog);
  const child = Object.assign(new Project(), { Id: 1, Title: "C" });
  ctx.set(Project).attach(child);
  prog.Title = "renamed"; // column change → parent is Modified, flushed + snapshot-refreshed in pass 1
  prog.OwnedProjects = [child]; // ...and a membership change
  await ctx.saveChangesAsync();
  const saved = await provider.getItemsByIdsAsync(
    projectsHandle,
    [1],
    ["ProgramId"],
  );
  expect((saved[0] as { ProgramId?: number }).ProgramId).toBe(1);
});

// --- Deleted children in the removal diff (live tenant failure). -------------------
// Teardown deletes the children, then the parent. Each delete untracks its entry, so a
// later membership diff — taken against a snapshot from when the collection was loaded —
// still names ids whose rows are gone. Nulling the FK of a row that no longer exists is
// a no-op, and so is refusing to for a required FK; neither may fail the save.

class RequiredFkCtx extends DbContext {
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
      e.hasOne(Program, (x) => x.Program)
        .withMany((p) => p.OwnedProjects)
        .isRequired();
    });
  }
}

async function seedParentWithChild(): Promise<FakeStorageProvider> {
  const provider = new FakeStorageProvider();
  provider.seedRow(programsHandle, { Title: "Alpha" });
  provider.seedRow(projectsHandle, { Title: "One", ProgramId: 1 });
  return provider;
}

it("deletes children then the parent, each in its own save", async () => {
  // The plain teardown order. It already held before the fix — a Deleted parent is
  // skipped by both inverse passes — and pins that skip, which is what keeps the
  // parent's stale membership snapshot from being diffed at all.
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  await handle.loadAsync();

  ctx.projects.remove(handle.currentValue[0]!);
  await ctx.saveChangesAsync();

  ctx.programs.remove(program!);
  await ctx.saveChangesAsync();

  expect(await provider.getItemByIdAsync(projectsHandle, 1, ["Id"])).toBeNull();
  expect(await provider.getItemByIdAsync(programsHandle, 1, ["Id"])).toBeNull();
});

it("REGRESSION: deleting a loaded child and dropping it from the collection in ONE save", async () => {
  // The child is deleted in pass 1 (deletes sort first) and untracked by reconcile, so
  // the pass-2 removal diff in the SAME save can no longer resolve it from the tracker.
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  await handle.loadAsync();
  const child = handle.currentValue[0]!;

  ctx.projects.remove(child);
  program!.OwnedProjects = [];
  await ctx.saveChangesAsync();

  ctx.programs.remove(program!);
  await ctx.saveChangesAsync();

  expect(await provider.getItemByIdAsync(projectsHandle, 1, ["Id"])).toBeNull();
  expect(await provider.getItemByIdAsync(programsHandle, 1, ["Id"])).toBeNull();
});

it("REGRESSION: a child deleted in an earlier save, dropped from the collection later", async () => {
  // Same shape across two saves: the row is already gone when the diff is computed, so
  // the FK reset has to reach the provider to discover it — and find nothing.
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  await handle.loadAsync();

  ctx.projects.remove(handle.currentValue[0]!);
  await ctx.saveChangesAsync();

  program!.OwnedProjects = [];
  program!.Title = "Alpha renamed";
  await ctx.saveChangesAsync();

  expect(await provider.getItemByIdAsync(projectsHandle, 1, ["Id"])).toBeNull();
  const saved = await provider.getItemsByIdsAsync(
    programsHandle,
    [1],
    ["Title"],
  );
  expect((saved[0] as { Title?: string }).Title).toBe("Alpha renamed");
});

it("REGRESSION: a required FK does not block the removal of an already-deleted child", async () => {
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(RequiredFkCtx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  const handle = ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects);
  await handle.loadAsync();

  ctx.projects.remove(handle.currentValue[0]!);
  await ctx.saveChangesAsync();

  program!.OwnedProjects = [];
  await expect(ctx.saveChangesAsync()).resolves.toBeGreaterThanOrEqual(0);
  expect(await provider.getItemByIdAsync(projectsHandle, 1, ["Id"])).toBeNull();
});

it("a required FK still blocks detaching a child that is still there", async () => {
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(RequiredFkCtx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  await ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects)
    .loadAsync();

  program!.OwnedProjects = [];
  await expect(ctx.saveChangesAsync()).rejects.toThrow(
    /its ProgramId is required/,
  );
});

it("a child JOINING a collection must exist — a missing row is still a hard failure", async () => {
  // The tolerance is scoped to the removal direction. Here the FK write is the caller's
  // instruction, so a row that is not there is a genuine inconsistency, not a no-op.
  const provider = await seedParentWithChild();
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const program = await ctx.programs.findAsync(1);
  await ctx
    .entry(program!)
    .collection<Project>((p) => p.OwnedProjects)
    .loadAsync();

  program!.OwnedProjects = [
    Object.assign(new Project(), { Id: 999, Title: "ghost" }),
  ];
  await expect(ctx.saveChangesAsync()).rejects.toThrow(
    /Project #999 not found for inverse fixup/,
  );
});
