import type {
  MigrationOperation,
  SchemaOperation,
} from "../operations/operations.js";

export type RunOperation = Extract<MigrationOperation, { op: "run" }>;

export type OpFence =
  | { kind: "schema"; ops: SchemaOperation[] }
  | { kind: "run"; op: RunOperation };

/**
 * Split a migration's ops at each `run`. `run` is arbitrary consumer code that
 * can observe schema, so everything before it must be committed before it fires.
 */
export function splitFences(ops: readonly MigrationOperation[]): OpFence[] {
  const fences: OpFence[] = [];
  let current: SchemaOperation[] = [];
  for (const op of ops) {
    if (op.op === "run") {
      if (current.length > 0) {
        fences.push({ kind: "schema", ops: current });
        current = [];
      }
      fences.push({ kind: "run", op });
    } else {
      current.push(op);
    }
  }
  if (current.length > 0) fences.push({ kind: "schema", ops: current });
  return fences;
}

/** The list title this op brings into existence, if any. */
function createdTitle(op: SchemaOperation): string | undefined {
  if (op.op === "createList") return op.title;
  if (op.op === "renameList") return op.to;
  return undefined;
}

/** Every list title this op needs to already exist. */
function referencedTitles(op: SchemaOperation): string[] {
  switch (op.op) {
    case "createList":
      return [];
    case "dropList":
      return [op.title];
    case "renameList":
      return [op.from];
    case "addField":
      return op.field.kind === "Lookup" ? [op.list, op.field.list] : [op.list];
    case "alterField":
    case "dropField":
    case "renameField":
    case "addIndex":
    case "dropIndex":
      return [op.list];
  }
}

/**
 * Group ops into waves, each of which is safe to send as one `$batch`.
 *
 * SharePoint cannot reference an entity created earlier in the same changeset,
 * so an op that touches a list created earlier in the current wave opens a new
 * one. Author order is never changed — the rule only ever closes a wave early.
 */
export function computeWaves(
  ops: readonly SchemaOperation[],
): SchemaOperation[][] {
  const waves: SchemaOperation[][] = [];
  let current: SchemaOperation[] = [];
  let created = new Set<string>();

  for (const op of ops) {
    const needsFreshWave =
      current.length > 0 && referencedTitles(op).some((t) => created.has(t));
    if (needsFreshWave) {
      waves.push(current);
      current = [];
      created = new Set();
    }
    current.push(op);
    const made = createdTitle(op);
    if (made !== undefined) created.add(made);
  }
  if (current.length > 0) waves.push(current);
  return waves;
}
