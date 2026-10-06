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
  @OneToMany(() => Project, { inverse: (p) => p.Department })
  Projects: Project[] | null = null;
}
@Entity({ list: "Projects" })
class Project {
  @Key Id?: number = undefined;
  @TextField() Title: string | null = null;
  @DateTimeField() Due: Date | null = null;
  @JsonField({ of: () => Step }) Head?: Step = undefined;
  @MultiJsonField({ of: () => Step }) Steps?: Step[] = undefined;
  @ManyToOne(() => Department, { inverse: (d) => d.Projects })
  Department: Department | null = null;
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

it("full mode serializes loaded targets one level deep; their navs become stubs", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  const dept = project.Department!;
  await ctx
    .entry(dept)
    .collection((d) => d.Projects)
    .loadAsync(); // cycle back
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
  expect(back.Department).toBe(project.Department);
});

it("an untracked stub becomes a bare target; an untracked full target is materialized", async () => {
  const { fresh } = await setup();
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
});

it("a clone keeps a Json shape's unknown keys", async () => {
  const { ctx, project } = await setup();
  expect(ctx.projects.serialize(ctx.projects.clone(project)).Head).toEqual({
    Title: "h",
    Extra: 1,
  });
});

it("missing keys stay absent, unknown keys are ignored, bad input throws", async () => {
  const { ctx } = await setup();
  const p = ctx.projects.deserialize({ Title: "x", Bogus: 1 } as never);
  expect(p.Title).toBe("x");
  expect(p.Due).toBeNull();
  expect((p as unknown as Record<string, unknown>).Bogus).toBeUndefined();
  expect(() => ctx.projects.deserialize("nope" as never)).toThrow(
    DataException,
  );
  expect(() =>
    ctx.projects.deserialize({ Due: "not a date" } as never),
  ).toThrow(DataException);
  expect(() =>
    ctx.projects.deserialize({ Department: { Title: "no id" } } as never),
  ).toThrow(DataException);
});

it("a draft that cleared a loaded reference round-trips as a clear", async () => {
  const { ctx, project } = await setup();
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  const draft = ctx.projects.clone(project);
  draft.Department = null; // DepartmentId still 1
  const back = ctx.projects.deserialize(
    JSON.parse(JSON.stringify(ctx.projects.serialize(draft))),
  );
  ctx.projects.update(back);
  expect(project.Department).toBeNull();
  expect(project.DepartmentId).toBeNull();
});

it("an unloaded null navigation is omitted, so it cannot clear anything", async () => {
  const { ctx, project } = await setup();
  const data = ctx.projects.serialize(project);
  expect("Department" in data).toBe(false);
  const back = ctx.projects.deserialize(data);
  await ctx
    .entry(project)
    .reference((p) => p.Department)
    .loadAsync();
  ctx.projects.update(back);
  expect(project.Department!.Title).toBe("Ops");
});
