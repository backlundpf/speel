import type { SchemaOpResult } from "./schema/SchemaSnapshot.js";
import { summarizeOp } from "./plan/buildSteps.js";

/**
 * Thrown when any op in a wave failed. `$batch` applies operations
 * independently, so the ops beside a failure are already committed — this
 * carries every failure at once rather than surfacing them one deploy at a time.
 */
export class MigrationApplyError extends Error {
  constructor(
    readonly migrationId: string,
    readonly failures: readonly SchemaOpResult[],
  ) {
    super(
      `migration '${migrationId}': ${failures.length} operation(s) failed:\n` +
        failures
          .map(
            (f) =>
              `  ${summarizeOp(f.op)} — ${f.error?.message ?? "unknown error"}`,
          )
          .join("\n"),
    );
    this.name = "MigrationApplyError";
  }
}
