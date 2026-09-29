// test/unit/Save/SaveExecutor.modes.test.ts
import { describe, it, expect } from "vitest";
import { SaveExecutor } from "../../../src/Save/SaveExecutor.js";
import { ChangeTracker } from "../../../src/ChangeTracker/ChangeTracker.js";
import { EntityState } from "../../../src/ChangeTracker/EntityEntry.js";
import { Model } from "../../../src/Metadata/Model.js";
import { EntityType } from "../../../src/Metadata/EntityType.js";
import { Property } from "../../../src/Metadata/Property.js";
import { FakeStorageProvider } from "../fakes/FakeStorageProvider.js";
import { DbUpdateException } from "../../../src/errors.js";

class Blog {
  Id?: number;
  Title?: string;
}

function setup() {
  const id = new Property({
    propertyName: "Id",
    columnName: "ID",
    displayName: "ID",
    config: { kind: "Number" },
    required: true,
    readOnly: true,
    key: true,
  });
  const title = new Property({
    propertyName: "Title",
    columnName: "Title",
    displayName: "Title",
    config: { kind: "Text", multiline: false, maxLength: 255 },
    required: false,
    readOnly: false,
    key: false,
  });
  const et = new EntityType<Blog>({
    ctor: Blog,
    list: { kind: "title", value: "Blogs" },
    properties: [id, title],
  });
  return {
    model: new Model([et]),
    provider: new FakeStorageProvider(),
    tracker: undefined as unknown as ChangeTracker,
    et,
  };
}

describe("SaveExecutor modes", () => {
  it("auto-splits when pending exceeds maxBatchSize", async () => {
    const s = setup();
    s.tracker = new ChangeTracker(s.model);
    const calls: number[] = [];
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      calls.push(ops.length);
      return origExec(ops);
    };

    for (let i = 0; i < 250; i++) {
      const b = new Blog();
      b.Title = `t${i}`;
      s.tracker.track(b, EntityState.Added);
    }
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync({ maxBatchSize: 100 })).toBe(250);
    expect(calls).toEqual([100, 100, 50]);
  });

  it("fail-fast: stops after the failing chunk", async () => {
    const s = setup();
    s.tracker = new ChangeTracker(s.model);
    for (let i = 0; i < 250; i++) {
      const b = new Blog();
      b.Title = `t${i}`;
      s.tracker.track(b, EntityState.Added);
    }
    let chunkIndex = 0;
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      const c = chunkIndex++;
      if (c === 1) {
        // mark every op as failure
        return ops.map((o) => ({
          kind: "failure" as const,
          clientToken: o.clientToken,
          status: 500,
          body: "boom",
        }));
      }
      return origExec(ops);
    };
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(
      exe.saveChangesAsync({ maxBatchSize: 100 }),
    ).rejects.toBeInstanceOf(DbUpdateException);
    // First 100 succeeded → Unchanged & tracked with promoted Ids
    expect(
      s.tracker.entries().filter((e) => e.state === EntityState.Unchanged)
        .length,
    ).toBe(100);
  });

  it("continueOnError: aggregates failures across chunks but does not abort early", async () => {
    const s = setup();
    s.tracker = new ChangeTracker(s.model);
    for (let i = 0; i < 50; i++) {
      const b = new Blog();
      b.Title = `t${i}`;
      s.tracker.track(b, EntityState.Added);
    }
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    let count = 0;
    s.provider.executeBatchAsync = async (ops) => {
      const results = await origExec(ops);
      // mutate first 5 results to failures
      return results
        .map((r, i) =>
          i < 5 && count === 0
            ? {
                kind: "failure" as const,
                clientToken: r.clientToken,
                status: 500,
                body: "x",
              }
            : r,
        )
        .concat([])
        .map((r) => r);
    };
    void count;

    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    await expect(
      exe.saveChangesAsync({ continueOnError: true }),
    ).rejects.toBeInstanceOf(DbUpdateException);
    // 45 successes
    expect(
      s.tracker.entries().filter((e) => e.state === EntityState.Unchanged)
        .length,
    ).toBe(45);
  });

  it("batched:false issues one provider call per operation", async () => {
    const s = setup();
    s.tracker = new ChangeTracker(s.model);
    const calls: number[] = [];
    const origExec = s.provider.executeBatchAsync.bind(s.provider);
    s.provider.executeBatchAsync = async (ops) => {
      calls.push(ops.length);
      return origExec(ops);
    };

    for (let i = 0; i < 4; i++) {
      const b = new Blog();
      b.Title = `t${i}`;
      s.tracker.track(b, EntityState.Added);
    }
    const exe = new SaveExecutor(s.model, s.provider, s.tracker);
    expect(await exe.saveChangesAsync({ batched: false })).toBe(4);
    expect(calls).toEqual([1, 1, 1, 1]);
  });
});
