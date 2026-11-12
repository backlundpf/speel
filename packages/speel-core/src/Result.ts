// src/Result.ts
//
// The standard outcome type for speel operations that report success or failure
// as data instead of throwing — typically one result per item of a multi-item
// call, so one failure never costs the others their outcome.
import {
  InvalidOperationException,
  OperationFailedException,
} from "./errors.js";

/**
 * One error, as data. Shaped after the OData / Microsoft REST error object
 * (`code`, `message`, `target`) — the error SharePoint itself returns — plus
 * transport facts and diagnostics.
 *
 * Data, not an exception: it survives `structuredClone` and serializes to JSON
 * (except whatever sits in `cause`). Branch on `code`, never on `message`.
 */
export interface IError {
  /** Stable, machine-matchable identifier. Branch on this, not on `message`. */
  readonly code: string;
  /** Human-readable, safe to show or log. */
  readonly message: string;
  /** What the error is about: a path, a field name, a clientToken. */
  readonly target?: string;
  /** HTTP status, when the error came from a server response. */
  readonly status?: number;
  /** The underlying error, response body, or upstream IError. Diagnostics only. */
  readonly cause?: unknown;
}

/**
 * The outcome of one operation: `{ ok, value?, errors? }`, where `ok` decides
 * which of the other two is present.
 *
 * - `ok: true` carries `value`; `ok: false` carries `errors`, never empty.
 * - `r.value` is readable without narrowing (`T | undefined`); after
 *   `if (r.ok)` it is `T`.
 * - Build with `Result.ok` / `Result.fail`; turn a failure into a throw with
 *   `Result.unwrap`.
 */
export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly errors?: undefined }
  | {
      readonly ok: false;
      readonly value?: undefined;
      readonly errors: readonly IError[];
    };

export const Result = {
  /** A successful result carrying `value`. */
  ok<T>(value: T): Result<T> {
    return { ok: true, value };
  },

  /** A failed result carrying one or more errors. */
  fail<T = never>(error: IError, ...more: IError[]): Result<T> {
    if (error === undefined) {
      throw new InvalidOperationException(
        "Result.fail requires at least one error.",
      );
    }
    return { ok: false, errors: [error, ...more] };
  },

  /** The value of an ok result; throws OperationFailedException carrying the errors otherwise. */
  unwrap<T>(r: Result<T>): T {
    if (r.ok) return r.value;
    throw new OperationFailedException(r.errors);
  },
};
