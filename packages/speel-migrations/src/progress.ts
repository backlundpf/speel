/**
 * What a run says about itself while it runs. `migrate()` and `migrateTo()`
 * stream these through `onProgress`; nothing is buffered, so an admin watching
 * sees the step that is in flight rather than a list once it is all over — the
 * difference between "this is hanging" and "this is working".
 *
 * A step is one migration operation. `step-start` fires for every op that will
 * be sent, a whole wave at a time, because a wave IS one batched request: the
 * ops in it are in flight together and finish together. An op the live schema
 * already satisfies reports `skipped` and never starts — nothing went out.
 */
export type MigrationEvent =
  // Separate members, not one with a two-literal `kind`: a consumer's switch can
  // then narrow each away, which a shared member would not allow.
  | { kind: "migration-start"; migrationId: string; direction: "up" | "down" }
  | { kind: "migration-done"; migrationId: string; direction: "up" | "down" }
  | { kind: "step-start"; migrationId: string; summary: string }
  | {
      kind: "step-done";
      migrationId: string;
      summary: string;
      status: "applied" | "skipped" | "failed";
      /** The failure message — present only on `status: 'failed'`. */
      error?: string;
    };

export interface MigrateOptions {
  /** Called as each migration and each step starts and finishes. */
  onProgress?: (event: MigrationEvent) => void;
}

/** Every event carries its migration, so a consumer can group without tracking brackets. */
export type ProgressEmit = (event: MigrationEvent) => void;

export const noProgress: ProgressEmit = () => undefined;
