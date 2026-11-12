// src/httpError.ts

/**
 * SharePoint's own error text, from a PnPjs HttpRequestError message. PnPjs 4.x
 * appends the raw response body after "::> "; SharePoint's body is an OData error,
 * `{ "odata.error" | "error": { code, message: { value } | string } }`. Undefined
 * when the message carries no such body.
 */
function serverMessageIn(wrapperMessage: string): string | undefined {
  const at = wrapperMessage.indexOf("::> ");
  if (at < 0) return undefined;
  let body: unknown;
  try {
    body = JSON.parse(wrapperMessage.slice(at + 4));
  } catch {
    return undefined;
  }
  const o = body as Record<string, { message?: unknown } | undefined>;
  const m = (o["odata.error"] ?? o["error"])?.message;
  if (typeof m === "string" && m) return m;
  const v = (m as { value?: unknown } | undefined)?.value;
  return typeof v === "string" && v ? v : undefined;
}

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
  const raw =
    typeof e.message === "string" && e.message ? e.message : String(err);
  const message = serverMessageIn(raw) ?? raw;
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
