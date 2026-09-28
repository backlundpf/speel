import type { IdentityOperation } from "./IdentityChangeQueue.js";

export interface IdentityOperationFailure {
  readonly operation: IdentityOperation;
  readonly error: Error;
}

/** What a completed save reports when everything landed. */
export interface IdentitySaveResult {
  readonly applied: number;
}

/**
 * SharePoint has no transaction spanning securables, so a save can be part-applied.
 *
 * Throwing with the tally rather than returning it means a caller cannot ignore the failures
 * by accident, while still being told exactly what landed — which matters, because the
 * queue is emptied either way and a blind retry would otherwise re-run what succeeded.
 */
export class IdentitySaveException extends Error {
  constructor(
    readonly applied: number,
    readonly failures: readonly IdentityOperationFailure[],
  ) {
    super(
      `${failures.length} of ${applied + failures.length} identity operations failed: ` +
        failures.map((f) => f.error.message).join("; "),
    );
    this.name = "IdentitySaveException";
  }
}
