// test/unit/optionsCreator.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  DbContext,
  ModelBuilder,
  Entity,
  Key,
  SpeelEntity,
  TextField,
  ManyToOne,
  EntityState,
} from "../../src/index.js";
import {
  createsByDisplayField,
  findByDisplayField,
} from "../../src/Metadata/optionsLoader.js";
import type { OptionsCreator } from "../../src/Metadata/optionsLoader.js";
import { NavigationConfigurationException } from "../../src/errors.js";
import type { FieldConfig } from "../../src/Metadata/FieldConfig.js";
import { FakeStorageProvider } from "./fakes/FakeStorageProvider.js";
import type {
  IBatchOperation,
  IBatchOperationResult,
} from "../../src/providers/ISharePointProvider.js";
import type { IListHandle } from "../../src/types.js";

type Lookup = Extract<FieldConfig, { kind: "Lookup" }>;
const asLookup = (c: FieldConfig): Lookup => c as Lookup;

class JobTitle {
  Id?: number;
  Title?: string;
}
class Person {
  Id?: number;
  Title?: string;
  JobTitle?: JobTitle;
}

/** Model exposes `findEntityType(ctor)`; an EntityType exposes `navigations()`. */
const navOf = (ctx: DbContext, ctor: never, name: string) =>
  ctx.model
    .findEntityType(ctor)!
    .navigations()
    .find((n) => n.name === name)!;

describe("optionsCreateAsync on the model", () => {
  it("reaches nav.config.optionsCreateAsync from the fluent route", () => {
    const creator: OptionsCreator = async () => undefined;
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(JobTitle, (b) => {
          b.toList("JobTitles");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
        mb.entity(Person, (b) => {
          b.toList("People");
          b.property((e) => e.Id).isNumber();
          b.hasOne(() => JobTitle, "JobTitle")
            .withMany()
            .hasDisplayField((t: JobTitle) => t.Title)
            .hasOptionsCreateAsync(creator);
        });
      }
    }
    const nav = navOf(
      new Ctx({ provider: {} as never } as never),
      Person as never,
      "JobTitle",
    );
    expect(asLookup(nav.config).optionsCreateAsync).toBe(creator);
  });

  it("wires the spec's canonical fluent example — hasOptionsCreateAsync(createsByDisplayField())", () => {
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(JobTitle, (b) => {
          b.toList("JobTitles");
          b.property((e) => e.Id).isNumber();
          b.property((e) => e.Title).isText();
        });
        mb.entity(Person, (b) => {
          b.toList("People");
          b.property((e) => e.Id).isNumber();
          b.hasOne(() => JobTitle, "JobTitle")
            .withMany()
            .hasDisplayField((t: JobTitle) => t.Title)
            .hasOptionsCreateAsync(createsByDisplayField());
        });
      }
    }
    const nav = navOf(
      new Ctx({ provider: {} as never } as never),
      Person as never,
      "JobTitle",
    );
    expect(typeof asLookup(nav.config).optionsCreateAsync).toBe("function");
  });

  it("a nav without it declares no such key", () => {
    class Ctx extends DbContext {
      protected override onModelCreating(mb: ModelBuilder): void {
        mb.entity(JobTitle, (b) => {
          b.toList("JobTitles");
          b.property((e) => e.Id).isNumber();
        });
        mb.entity(Person, (b) => {
          b.toList("People");
          b.property((e) => e.Id).isNumber();
          b.hasOne(() => JobTitle, "JobTitle").withMany();
        });
      }
    }
    const nav = navOf(
      new Ctx({ provider: {} as never } as never),
      Person as never,
      "JobTitle",
    );
    expect("optionsCreateAsync" in nav.config).toBe(false);
  });

  it("reaches nav.config.optionsCreateAsync from the decorator route", () => {
    const creator: OptionsCreator = async () => undefined;

    @Entity({ list: "OC_JobTitles" })
    class OcJobTitle extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @TextField() public Title: string | null = null;
    }
    @Entity({ list: "OC_People" })
    class OcPerson extends SpeelEntity {
      @Key public override Id?: number = undefined;
      @ManyToOne(() => OcJobTitle, { optionsCreateAsync: creator })
      public JobTitle: OcJobTitle | null = null;
    }
    class Ctx extends DbContext {
      public people = this.set(OcPerson);
      public jobTitles = this.set(OcJobTitle);
    }
    const nav = navOf(
      new Ctx({ provider: new FakeStorageProvider() }),
      OcPerson as never,
      "JobTitle",
    );
    expect(asLookup(nav.config).optionsCreateAsync).toBe(creator);
  });

  it("an inverse (withOne) navigation declaring it throws at build", () => {
    class Blog2 {
      Id?: number;
      Title?: string;
      Comments?: Comment2[];
    }
    class Comment2 {
      Id?: number;
      Text?: string;
      BlogId?: number;
      Blog?: Blog2;
    }
    const mb = new ModelBuilder();
    mb.entity(Comment2, (b) => {
      b.toList("Comments2");
      b.property((e) => e.Id).isNumber();
    });
    mb.entity(Blog2, (b) => {
      b.toList("Blogs2");
      b.property((e) => e.Id).isNumber();
      b.hasMany(Comment2, (e) => e.Comments)
        .withOne((c) => c.Blog)
        .hasForeignKey((c) => c.BlogId)
        .hasOptionsCreateAsync(async () => undefined);
    });
    expect(() => mb.build()).toThrow(NavigationConfigurationException);
  });
});

function newCtx(fake: FakeStorageProvider = new FakeStorageProvider()): {
  db: Ctx;
  fake: FakeStorageProvider;
} {
  return { db: new Ctx({ provider: fake }), fake };
}

class Ctx extends DbContext {
  public jobTitles = this.set(JobTitle);
  public people = this.set(Person);
  protected override onModelCreating(mb: ModelBuilder): void {
    mb.entity(JobTitle, (b) => {
      b.toList("JobTitles");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
    mb.entity(Person, (b) => {
      b.toList("People");
      b.property((e) => e.Id).isNumber();
      b.property((e) => e.Title).isText();
    });
  }
}

const jobTitlesList: IListHandle = { kind: "title", value: "JobTitles" };

describe("createsByDisplayField()", () => {
  it("returns an existing exact match, and the provider sees no insert", async () => {
    const { db, fake } = newCtx();
    fake.seedRow(jobTitlesList, { Title: "Engineer" });
    const spy = vi.spyOn(fake, "executeBatchAsync");
    const creator = createsByDisplayField<Record<string, never>, JobTitle>();

    const row = await creator({
      text: "Engineer",
      set: db.set(JobTitle),
      db,
      source: {},
      displayField: "Title",
    });

    expect(row?.Title).toBe("Engineer");
    expect(row?.Id).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("inserts one row with the trimmed text in the display field and returns it with its id", async () => {
    const { db } = newCtx();
    const creator = createsByDisplayField<Record<string, never>, JobTitle>();

    const row = await creator({
      text: "Analyst",
      set: db.set(JobTitle),
      db,
      source: {},
      displayField: "Title",
    });

    expect(row?.Title).toBe("Analyst");
    expect(row?.Id).toBeDefined();
    const found = await findByDisplayField(
      db.set(JobTitle),
      "Title",
      "Analyst",
    );
    expect(found?.Id).toBe(row?.Id);
  });

  it("saves through a scope: a parent's own pending change is not written", async () => {
    const { db, fake } = newCtx();
    const pendingPerson = new Person();
    const entry = db.set(Person).add(pendingPerson);
    const spy = vi.spyOn(fake, "executeBatchAsync");
    const creator = createsByDisplayField<Record<string, never>, JobTitle>();

    await creator({
      text: "Analyst",
      set: db.set(JobTitle),
      db,
      source: {},
      displayField: "Title",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const ops = spy.mock.calls[0]![0] as IBatchOperation[];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ kind: "insert", list: jobTitlesList });
    // The parent's own pending Person add was never flushed.
    expect(entry.state).toBe(EntityState.Added);
  });

  it("on an insert failure, returns a row that now exists (won by another) instead of rethrowing", async () => {
    class RaceProvider extends FakeStorageProvider {
      override async executeBatchAsync(
        operations: readonly IBatchOperation[],
      ): Promise<readonly IBatchOperationResult[]> {
        return operations.map((op) => {
          if (op.kind !== "insert") throw new Error(`unexpected op ${op.kind}`);
          // Simulate another user's concurrent insert winning the race, right
          // in the reject hook — the row now exists by the time we fail.
          this.seedRow(op.list, { Title: "Analyst" });
          return {
            kind: "failure" as const,
            clientToken: op.clientToken,
            status: 409,
            body: "conflict",
          };
        });
      }
    }
    const { db } = newCtx(new RaceProvider());
    const creator = createsByDisplayField<Record<string, never>, JobTitle>();

    const row = await creator({
      text: "Analyst",
      set: db.set(JobTitle),
      db,
      source: {},
      displayField: "Title",
    });

    expect(row?.Title).toBe("Analyst");
    expect(row?.Id).toBeDefined();
  });

  it("rethrows the insert error when the row still does not exist", async () => {
    class AlwaysFailProvider extends FakeStorageProvider {
      override async executeBatchAsync(
        operations: readonly IBatchOperation[],
      ): Promise<readonly IBatchOperationResult[]> {
        return operations.map((op) => ({
          kind: "failure" as const,
          clientToken: op.clientToken,
          status: 500,
          body: "boom",
        }));
      }
    }
    const { db } = newCtx(new AlwaysFailProvider());
    const creator = createsByDisplayField<Record<string, never>, JobTitle>();

    await expect(
      creator({
        text: "Analyst",
        set: db.set(JobTitle),
        db,
        source: {},
        displayField: "Title",
      }),
    ).rejects.toThrow();
  });
});
