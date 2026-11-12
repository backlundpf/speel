// src/httpError.ts

/**
 * SharePoint's own error, from a PnPjs HttpRequestError message. PnPjs 4.x
 * appends the raw response body after "::> "; SharePoint's body is an OData error,
 * `{ "odata.error" | "error": { code, message: { value } | string } }`. Each part is
 * undefined when the message carries no such body.
 */
function serverErrorIn(wrapperMessage: string): {
  code?: string;
  message?: string;
} {
  const at = wrapperMessage.indexOf("::> ");
  if (at < 0) return {};
  let body: unknown;
  try {
    body = JSON.parse(wrapperMessage.slice(at + 4));
  } catch {
    return {};
  }
  const o = body as Record<
    string,
    { code?: unknown; message?: unknown } | undefined
  >;
  const err = o["odata.error"] ?? o["error"];
  const code = typeof err?.code === "string" && err.code ? err.code : undefined;
  const m = err?.message;
  const v = typeof m === "string" ? m : (m as { value?: unknown })?.value;
  const message = typeof v === "string" && v ? v : undefined;
  return {
    ...(code !== undefined ? { code } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

/**
 * The wire facts of a rejected PnPjs request: its HTTP status when there was a
 * response, the most specific body available, a human-readable message (the
 * server's own text when the body carries one), and the server's error code.
 *
 * `serverCode` is SharePoint's `odata.error.code` — e.g.
 * `"-2130245363, Microsoft.SharePoint.SPException"` — which, unlike the message,
 * is not localized. Match on it, not on the text.
 *
 * PnPjs rejects loosely (an HttpRequestError, a plain object, sometimes a bare
 * value), so every field is read defensively.
 */
export function httpErrorFacts(err: unknown): {
  status?: number;
  message: string;
  body: unknown;
  serverCode?: string;
} {
  if (typeof err !== "object" || err === null) {
    return { message: String(err), body: err };
  }
  const e = err as { status?: unknown; message?: unknown; data?: unknown };
  const raw =
    typeof e.message === "string" && e.message ? e.message : String(err);
  const server = serverErrorIn(raw);
  const body =
    e.data !== undefined
      ? e.data
      : typeof e.message === "string" && e.message
        ? e.message
        : err;
  return {
    ...(typeof e.status === "number" ? { status: e.status } : {}),
    message: server.message ?? raw,
    body,
    ...(server.code !== undefined ? { serverCode: server.code } : {}),
  };
}
