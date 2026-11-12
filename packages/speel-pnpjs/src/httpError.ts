// src/httpError.ts

/**
 * The wire facts of a rejected PnPjs request: its HTTP status when there was a
 * response, the most specific body available, and a human-readable message.
 * PnPjs rejects loosely (an HttpRequestError, a plain object, sometimes a bare
 * value), so every field is read defensively.
 */
export function httpErrorFacts(err: unknown): {
  status?: number;
  message: string;
  body: unknown;
} {
  if (typeof err !== "object" || err === null) {
    return { message: String(err), body: err };
  }
  const e = err as { status?: unknown; message?: unknown; data?: unknown };
  const message =
    typeof e.message === "string" && e.message ? e.message : String(err);
  const body =
    e.data !== undefined
      ? e.data
      : typeof e.message === "string" && e.message
        ? e.message
        : err;
  return typeof e.status === "number"
    ? { status: e.status, message, body }
    : { message, body };
}
