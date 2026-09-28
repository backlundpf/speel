import type { SchemaOperation } from "../operations/operations.js";
import type { ISchemaProvider } from "./ISchemaProvider.js";
import {
  applyResultToSnapshot,
  emptySnapshot,
  type SchemaOpResult,
  type SchemaSnapshot,
} from "./SchemaSnapshot.js";

/**
 * In-memory ISchemaProvider for tests. Holds one snapshot, folds applied ops
 * into it with the same helper the Migrator uses, and records every call so
 * tests can assert request shape as well as outcome.
 */
export class FakeSchemaProvider implements ISchemaProvider {
  private readonly snapshot: SchemaSnapshot = emptySnapshot();

  /** One entry per applyAsync call, in order. Assert batching with this. */
  readonly applyCalls: SchemaOperation[][] = [];

  /** Return a message to make an op fail; undefined to let it apply. */
  failOn?: (op: SchemaOperation) => string | undefined;

  async readSchemaAsync(): Promise<SchemaSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  async applyAsync(
    ops: readonly SchemaOperation[],
    _snapshot: SchemaSnapshot,
  ): Promise<readonly SchemaOpResult[]> {
    this.applyCalls.push([...ops]);
    const results: SchemaOpResult[] = ops.map((op) => {
      const failure = this.failOn?.(op);
      if (failure !== undefined) {
        return { op, status: "failed", error: new Error(failure) };
      }
      return op.op === "createList"
        ? { op, status: "applied", listId: `fake-guid-${op.title}` }
        : { op, status: "applied" };
    });
    for (const r of results) applyResultToSnapshot(this.snapshot, r);
    return results;
  }
}

function cloneSnapshot(snapshot: SchemaSnapshot): SchemaSnapshot {
  const lists = new Map(
    [...snapshot.lists].map(([title, l]) => [
      title,
      { ...l, fields: new Map([...l.fields].map(([k, f]) => [k, { ...f }])) },
    ]),
  );
  return { lists };
}
