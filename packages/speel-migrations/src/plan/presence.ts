import type { MigrationOperation } from "../operations/operations.js";
import type { SchemaSnapshot } from "../schema/SchemaSnapshot.js";
import type { PlanStep, StepPresence } from "./PlanTypes.js";

/**
 * Live state of a step's target, read from the snapshot the Migrator already
 * holds. Costs no requests of its own.
 *
 * Existence is answerable for every schema op, including index state, which the
 * old per-op interface could not read at all. Only `run` stays 'unknown' — its
 * effects are arbitrary code.
 */
function presenceOf(
  snapshot: SchemaSnapshot,
  op: MigrationOperation,
): StepPresence {
  const yes = (b: boolean): StepPresence => (b ? "present" : "absent");
  const list = (title: string) => snapshot.lists.get(title);
  const hasField = (title: string, name: string): boolean =>
    list(title)?.fields.has(name) ?? false;

  switch (op.op) {
    case "createList":
    case "dropList":
      return yes(list(op.title) !== undefined);
    case "renameList":
      return yes(list(op.from) !== undefined);
    case "addField":
    case "alterField":
      return yes(hasField(op.list, op.field.internalName));
    case "dropField":
      return yes(hasField(op.list, op.name));
    case "renameField":
      return yes(hasField(op.list, op.from));
    case "addIndex":
    case "dropIndex":
      return yes(list(op.list)?.fields.get(op.field)?.indexed === true);
    case "run":
      return "unknown"; // arbitrary code
  }
}

/** Fill in each step's `presence` from the snapshot. Mutates in place. */
export function annotateSteps(
  snapshot: SchemaSnapshot,
  steps: PlanStep[],
): void {
  for (const step of steps) {
    step.presence = presenceOf(snapshot, step.op);
  }
}
