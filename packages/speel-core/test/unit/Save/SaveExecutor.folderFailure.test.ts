import { describe, it, expect, beforeEach } from "vitest";
import { ModelBuilder } from "../../../src/ModelBuilder/ModelBuilder.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { DbSet } from "../../../src/DbSet.js";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { SpeelEntity } from "../../../src/SpeelEntity.js";
import { DbUpdateException } from "../../../src/errors.js";
import type { IError } from "../../../src/Result.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import type { IBatchOperation } from "../../../src/providers/ISharePointProvider.js";
import { TestPrincipal as Principal } from "../fakes/testPrincipals.js";

class Task extends SpeelEntity {
  Title: string | null = null;
}

function buildModel() {
  const mb = new ModelBuilder();
  mb.entity(Principal, (b) =>
    b.toProviderSource({ kind: "provider", key: "principals" }),
  );
  mb.entity(Task, (b) => {
    b.toList("Tasks");
    b.property((e) => e.Title).isText();
  });
  return mb.build();
}

function task(title: string): Task {
  const t = new Task();
  t.Title = title;
  return t;
}

describe("add({ folder }) when a folder cannot be ensured", () => {
  let provider: FakeStorageProvider;
  let set: DbSet<Task>;
  let save: () => Promise<number>;
  let sentOps: IBatchOperation[];

  beforeEach(() => {
    provider = new FakeStorageProvider();
    const model = buildModel();
    const tracker = new ChangeTracker(model, provider);
    set = new DbSet<Task>(Task, model, provider, tracker);
    const exe = new SaveExecutor(model, provider, tracker);
    save = () => exe.saveChangesAsync();
    sentOps = [];
    const exec = provider.executeBatchAsync.bind(provider);
    provider.executeBatchAsync = async (ops) => {
      sentOps.push(...ops);
      return exec(ops);
    };
  });

  it("a failed folder fails the save before any item op, listing every affected entry", async () => {
    provider.failFolderOn("bad", { status: 403, message: "Access denied." });
    const b1 = task("b1");
    const b2 = task("b2");
    const g = task("g");
    set.add(b1, { folder: "bad" });
    set.add(b2, { folder: "bad" });
    set.add(g, { folder: "good" });

    const err = await save().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(DbUpdateException);
    const ex = err as DbUpdateException;
    expect(ex.entries).toHaveLength(2);
    expect(
      ex.entries.map((e) => (e as { entity: Task }).entity.Title).sort(),
    ).toEqual(["b1", "b2"]);
    expect(ex.innerErrors).toHaveLength(2);
    for (const ie of ex.innerErrors) {
      expect((ie as IError).code).toBe("requestFailed");
    }
    expect(ex.message).toContain("bad");
    expect(ex.message).toContain("Access denied.");
    // No item op ran — the good entity was not inserted either.
    expect(sentOps).toEqual([]);
  });
});
