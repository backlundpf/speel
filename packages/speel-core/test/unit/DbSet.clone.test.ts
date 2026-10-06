import { it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
  Entity,
  JsonShape,
  TextField,
  JsonField,
} from "../../src/index.js";
import { EntityState } from "../../src/ChangeTracker/EntityEntry.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";

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
  provider.seedRow(
    { kind: "title", value: "Projects" },
    { Title: "A", ProgramId: 1, Code: "X" },
  );
  const ctx = initSpeelDbContext(Ctx, (b) => b.useProvider(provider));
  const project = (await ctx.projects.findAsync(1))!;
  return { ctx, project };
}

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
  ctx.entry(project).state = EntityState.Unchanged;
  const copy = ctx.projects.clone(project);
  expect(copy).toBeInstanceOf(Project);
  expect(copy).not.toBe(project);
  expect(copy.Id).toBe(1);
  expect(copy.Code).toBe("X");
  expect(copy.Due).not.toBe(project.Due);
  expect(copy.Due!.getTime()).toBe(project.Due.getTime());
  expect(copy.Program).toBe(project.Program);
  expect(ctx.changeTracker.entryFor(copy)).toBeUndefined();
  expect(ctx.entry(project).state).toBe(EntityState.Unchanged);
});

it("clone keeps a Json shape's class", async () => {
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

it("clearing a reference on a clone the form loaded is applied, FK included", async () => {
  const { ctx, project } = await setup();
  const copy = ctx.projects.clone(project); // Program not loaded at copy time
  await ctx
    .entry(copy)
    .reference((p) => p.Program)
    .loadAsync(); // the form loads it
  expect(copy.Program!.Title).toBe("P1");
  copy.Program = null; // the user clears the picker; ProgramId still says 1
  const entry = ctx.projects.update(copy);
  expect(project.Program).toBeNull();
  expect(project.ProgramId).toBeNull();
  expect(entry.getDirtyColumns()).toContain("ProgramId");
});

it("a clone of a loaded reference carries the clear through", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Program)
    .loadAsync();
  const copy = ctx.projects.clone(project);
  copy.Program = null;
  ctx.projects.update(copy);
  expect(project.ProgramId).toBeNull();
});
