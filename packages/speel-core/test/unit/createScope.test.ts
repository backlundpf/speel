import { describe, it, expect } from "vitest";
import {
  DbContext,
  ModelBuilder,
  initSpeelDbContext,
  EntityState,
} from "../../src/index.js";
import type { IDbContextOptions } from "../../src/index.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import { InMemoryCacheProvider } from "../../src/Cache/InMemoryCacheProvider.js";

class Program {
  Id?: number;
  Title: string | null = null;
}
class Project {
  Id?: number;
  Title: string | null = null;
  Program: Program | null = null;
  ProgramId: number | null = null;
}

let modelCreations = 0;

class Ctx extends DbContext {
  public projects = this.set(Project);
  public programs = this.set(Program);
  protected override onModelCreating(b: ModelBuilder): void {
    modelCreations++;
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
    });
    b.entity(Project, (e) => {
      e.toList("Projects");
      e.property((x) => x.Title).isText();
      e.hasOne(Program, (x) => x.Program).withMany();
    });
  }
}

class CachedCtx extends DbContext {
  public programs = this.set(Program);
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
      e.useCaching((c) => c.withTimeout(1_000_000));
    });
  }
}

class TaggedCtx extends DbContext {
  public programs = this.set(Program);
  public readonly helper = { name: "shared" };
  constructor(
    options: IDbContextOptions,
    public readonly tag: string,
  ) {
    super(options);
  }
  protected override onModelCreating(b: ModelBuilder): void {
    b.entity(Program, (e) => {
      e.toList("Programs");
      e.property((x) => x.Title).isText();
    });
  }
}

const make = (sp: FakeStorageProvider): Ctx =>
  initSpeelDbContext(Ctx, (b) => b.useProvider(sp));

const program = (title: string): Program =>
  Object.assign(new Program(), { Title: title });
const project = (title: string): Project =>
  Object.assign(new Project(), { Title: title });

/** What the provider actually holds, read through a fresh, unrelated context. */
const storedTitles = async (
  sp: FakeStorageProvider,
  pick: (c: Ctx) => { toArrayAsync(): Promise<{ Title: string | null }[]> },
): Promise<(string | null)[]> =>
  (await pick(make(sp)).toArrayAsync()).map((r) => r.Title).sort();

describe("db.createScope()", () => {
  it("saves only the scope's changes; the parent's pending add stays pending", async () => {
    const sp = new FakeStorageProvider();
    const db = make(sp);
    const parentRow = program("Parent pending");
    db.programs.add(parentRow);
    const scope = db.createScope();
    scope.programs.add(program("Scoped"));

    await scope.saveChangesAsync();

    expect(await storedTitles(sp, (c) => c.programs)).toEqual(["Scoped"]);
    expect(db.changeTracker.entryFor(parentRow)?.state).toBe(EntityState.Added);
    expect(db.changeTracker.hasChanges()).toBe(true);
    expect(scope.changeTracker.hasChanges()).toBe(false);
  });

  it("is an instance of the parent's class with its DbSet properties bound to itself", () => {
    const db = make(new FakeStorageProvider());
    const scope = db.createScope();
    expect(scope).toBeInstanceOf(Ctx);
    expect(scope.programs).not.toBe(db.programs);
    expect(scope.programs).toBe(scope.set(Program));

    const x = program("x");
    scope.programs.add(x);
    expect(scope.changeTracker.entryFor(x)?.state).toBe(EntityState.Added);
    expect(db.changeTracker.entryFor(x)).toBeUndefined();
  });

  it("gives the parent and the scope distinct instances of the same row", async () => {
    const sp = new FakeStorageProvider();
    sp.seedRow({ kind: "title", value: "Programs" }, { Title: "A" });
    const db = make(sp);
    const scope = db.createScope();
    const [fromParent] = await db.programs.toArrayAsync();
    const [fromScope] = await scope.programs.toArrayAsync();
    expect(fromParent!.Id).toBe(fromScope!.Id);
    expect(fromParent).not.toBe(fromScope);
  });

  it("shares the model: onModelCreating runs once for parent and scope", () => {
    const db = make(new FakeStorageProvider());
    const before = modelCreations;
    const model = db.model;
    const scope = db.createScope();
    const nested = scope.createScope();
    expect(scope.model).toBe(model);
    expect(nested.model).toBe(model);
    expect(modelCreations - before).toBe(1);
  });

  it("invalidates, through the shared coordinator, the caches the parent reads", async () => {
    const sp = new FakeStorageProvider();
    sp.seedRow({ kind: "title", value: "Programs" }, { Title: "A" });
    const db = initSpeelDbContext(CachedCtx, (b) => {
      b.useProvider(sp);
      b.useCaching(new InMemoryCacheProvider());
    });
    expect((await db.programs.cacheAsync()).map((p) => p.Title)).toEqual(["A"]);

    const scope = db.createScope();
    scope.programs.add(program("B"));
    await scope.saveChangesAsync();

    expect((await db.programs.cacheAsync()).map((p) => p.Title).sort()).toEqual(
      ["A", "B"],
    );
  });

  it("hands a scope-created row to the parent as a nav value without inserting it twice", async () => {
    const sp = new FakeStorageProvider();
    sp.seedRow({ kind: "title", value: "Projects" }, { Title: "P1" });
    const db = make(sp);
    const [p1] = await db.projects.toArrayAsync();

    const scope = db.createScope();
    const created = program("Created");
    scope.programs.add(created);
    await scope.saveChangesAsync();
    expect(created.Id).toBeTypeOf("number");

    p1!.Program = created;
    await db.saveChangesAsync();

    expect(db.changeTracker.entryFor(created)).toBeUndefined();
    const [reread] = await make(sp).projects.toArrayAsync();
    expect(reread!.ProgramId).toBe(created.Id);
    expect(await storedTitles(sp, (c) => c.programs)).toEqual(["Created"]);
  });

  it("works for a subclass whose constructor takes extra arguments; other state is shared by reference", async () => {
    const sp = new FakeStorageProvider();
    const db = new TaggedCtx({ provider: sp }, "tag-1");
    const scope = db.createScope();
    expect(scope).toBeInstanceOf(TaggedCtx);
    expect(scope.tag).toBe("tag-1");
    expect(scope.helper).toBe(db.helper);
    expect(scope.programs).not.toBe(db.programs);

    scope.programs.add(program("Tagged"));
    await scope.saveChangesAsync();
    expect(
      (await new TaggedCtx({ provider: sp }, "t").programs.toArrayAsync()).map(
        (r) => r.Title,
      ),
    ).toEqual(["Tagged"]);
  });

  it("disposes each side independently", async () => {
    const sp = new FakeStorageProvider();
    const db = make(sp);
    const scope = db.createScope();
    scope.dispose();
    expect(() => scope.programs.add(program("no"))).toThrow(/disposed/);
    db.programs.add(program("Parent"));
    await db.saveChangesAsync();

    const scope2 = db.createScope();
    db.dispose();
    expect(() => db.programs.add(program("no"))).toThrow(/disposed/);
    scope2.programs.add(program("Scope2"));
    await scope2.saveChangesAsync();
    expect(await storedTitles(sp, (c) => c.programs)).toEqual([
      "Parent",
      "Scope2",
    ]);
  });

  it("loads navigations explicitly into the scope's own tracker", async () => {
    const sp = new FakeStorageProvider();
    const progId = sp.seedRow(
      { kind: "title", value: "Programs" },
      { Title: "Prog" },
    );
    sp.seedRow(
      { kind: "title", value: "Projects" },
      { Title: "P1", ProgramId: progId },
    );
    const db = make(sp);
    const scope = db.createScope();
    const [p1] = await scope.projects.toArrayAsync();
    await scope.entry(p1!).reference("Program").loadAsync();
    expect(p1!.Program?.Title).toBe("Prog");
    expect(scope.changeTracker.entryFor(p1!.Program!)).toBeDefined();
    expect(db.changeTracker.entries()).toHaveLength(0);
  });
});
