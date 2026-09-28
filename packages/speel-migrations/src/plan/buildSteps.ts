import type { MigrationOperation } from "../operations/operations.js";
import type { PlanStep } from "./PlanTypes.js";

/** One line describing what an operation does, for an admin reading a preview. */
export function summarizeOp(op: MigrationOperation): string {
  switch (op.op) {
    case "createList":
      return `Create list "${op.title}"`;
    case "dropList":
      return `Delete list "${op.title}" (to the site recycle bin)`;
    case "renameList":
      return `Rename list "${op.from}" to "${op.to}"`;
    case "addField":
      return `Add field ${op.field.internalName} (${op.field.kind}) to "${op.list}"`;
    case "alterField":
      return `Alter field ${op.field.internalName} (${op.field.kind}) on "${op.list}"`;
    case "dropField":
      return `Drop field ${op.name} from "${op.list}"`;
    case "renameField":
      return `Rename field ${op.from} to ${op.to} on "${op.list}"`;
    case "addIndex":
      return `Index field ${op.field} on "${op.list}"`;
    case "dropIndex":
      return `Remove the index on ${op.field} on "${op.list}"`;
    case "run":
      return op.label ?? "Custom data step";
  }
}

/** Data loss if the step runs. Dropped lists go to the recycle bin; dropped fields do not. */
export function isDestructive(op: MigrationOperation): boolean {
  return op.op === "dropList" || op.op === "dropField";
}

export function buildSteps(
  migrationId: string,
  direction: "up" | "down",
  ops: readonly MigrationOperation[],
  willRun: boolean,
): PlanStep[] {
  return ops.map((op) => ({
    migrationId,
    direction,
    op,
    summary: summarizeOp(op),
    willRun,
    destructive: isDestructive(op),
    presence: "unknown" as const,
    opaque: op.op === "run",
    ...(op.op === "run" && op.label !== undefined ? { label: op.label } : {}),
    ...(op.op === "run" ? { source: op.run.toString() } : {}),
  }));
}
