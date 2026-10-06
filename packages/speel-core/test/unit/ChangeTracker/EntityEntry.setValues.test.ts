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
  ctx.entry(project).setValues({ Id: 99, Code: "Y" });
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
  expect(p1.Title).toBe("P1");
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
  expect(loaded).toHaveLength(1);
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
