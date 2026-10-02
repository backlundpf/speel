import type { SchemaOperation } from "../operations/operations.js";
import { spFieldTypeOf } from "../plan/dataLoss.js";

export interface FieldInfo {
  internalName: string;
  typeAsString: string;
  required: boolean;
  indexed: boolean;
}

export interface ListInfo {
  /** SharePoint list GUID. Lookup columns need it to name their target. */
  id: string;
  title: string;
  /** Keyed by internal name. */
  fields: Map<string, FieldInfo>;
}

/** The live schema as one readable object, keyed by list title. */
export interface SchemaSnapshot {
  lists: Map<string, ListInfo>;
}

export interface SchemaOpResult {
  op: SchemaOperation;
  status: "applied" | "failed";
  /** Set by a successful createList, read back from the batch response. */
  listId?: string;
  error?: Error;
}

export function emptySnapshot(): SchemaSnapshot {
  return { lists: new Map() };
}

/**
 * True when the live schema already satisfies `op`, so it need not be sent.
 *
 * `alterField` and `renameField` always return false. `FieldInfo` carries only
 * type/required/indexed, which cannot prove a full spec matches, and
 * `renameField` sets the *display* title, which a snapshot keyed by internal
 * name does not track. Both are idempotent MERGEs, so re-sending costs one
 * sub-request inside a batch — much cheaper than a false skip that leaves a
 * column wrong.
 *
 * Index ops on a field that does not exist are NOT satisfied. They are sent and
 * fail loudly, because a migration indexing a missing column is a bug.
 */
export function isSatisfied(
  snapshot: SchemaSnapshot,
  op: SchemaOperation,
): boolean {
  const list = (title: string): ListInfo | undefined =>
    snapshot.lists.get(title);
  switch (op.op) {
    case "createList":
      return list(op.title) !== undefined;
    case "dropList":
      return list(op.title) === undefined;
    case "renameList":
      return list(op.from) === undefined;
    case "addField":
      return list(op.list)?.fields.has(op.field.internalName) ?? false;
    case "dropField":
      return !(list(op.list)?.fields.has(op.name) ?? false);
    case "addIndex":
      return list(op.list)?.fields.get(op.field)?.indexed === true;
    case "dropIndex":
      return list(op.list)?.fields.get(op.field)?.indexed === false;
    case "alterField":
    case "renameField":
      return false;
  }
}

/** Fold a successful op into the in-memory snapshot. Failures change nothing. */
export function applyResultToSnapshot(
  snapshot: SchemaSnapshot,
  result: SchemaOpResult,
): void {
  if (result.status !== "applied") return;
  const { op } = result;
  const lists = snapshot.lists;
  switch (op.op) {
    case "createList":
      lists.set(op.title, {
        id: result.listId ?? "",
        title: op.title,
        fields: new Map(),
      });
      return;
    case "dropList":
      lists.delete(op.title);
      return;
    case "renameList": {
      const l = lists.get(op.from);
      if (!l) return;
      lists.delete(op.from);
      lists.set(op.to, { ...l, title: op.to });
      return;
    }
    case "addField": {
      const l = lists.get(op.list);
      if (!l) return;
      l.fields.set(op.field.internalName, {
        internalName: op.field.internalName,
        typeAsString: spFieldTypeOf(op.field),
        required: op.field.required ?? false,
        indexed: op.field.indexed ?? false,
      });
      return;
    }
    case "alterField": {
      const f = lists.get(op.list)?.fields.get(op.field.internalName);
      if (!f) return;
      f.typeAsString = spFieldTypeOf(op.field);
      f.required = op.field.required ?? false;
      if (op.field.indexed !== undefined) f.indexed = op.field.indexed;
      return;
    }
    case "dropField":
      lists.get(op.list)?.fields.delete(op.name);
      return;
    case "renameField":
      // Sets the display title only; the snapshot is keyed by internal name,
      // which does not move. Nothing to record.
      return;
    case "addIndex":
    case "dropIndex": {
      const f = lists.get(op.list)?.fields.get(op.field);
      if (f) f.indexed = op.op === "addIndex";
      return;
    }
  }
}
