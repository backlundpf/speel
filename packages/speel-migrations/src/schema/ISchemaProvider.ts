import type { ListSpec, SchemaOperation } from "../operations/operations.js";
import type { SchemaSnapshot, SchemaOpResult } from "./SchemaSnapshot.js";

export type { ListSpec };

export interface ISchemaProvider {
  /** Read the whole live schema in as few requests as the backend allows. */
  readSchemaAsync(): Promise<SchemaSnapshot>;

  /**
   * Apply `ops` as a batch and report each one independently. Partial failure
   * leaves earlier operations committed — the caller inspects the results.
   *
   * `snapshot` is read-only here; it supplies the list GUIDs a Lookup column's
   * definition needs, so the provider never has to make a read of its own.
   * Callers pass only ops that need doing, so there is no "skipped" status.
   */
  applyAsync(
    ops: readonly SchemaOperation[],
    snapshot: SchemaSnapshot,
  ): Promise<readonly SchemaOpResult[]>;
}
