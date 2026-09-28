// src/Cache/changeToken.ts

// .NET DateTime ticks are 100-nanosecond intervals since 0001-01-01T00:00:00Z.
// The Unix epoch (1970-01-01) is 621355968000000000 ticks after that.
const EPOCH_TICKS = 621355968000000000;
const TICKS_PER_MS = 10000;

/**
 * SharePoint change tokens look like `1;3;{listId};{ticks};{changeNumber}`.
 * Parse the 4th (ticks) segment into epoch milliseconds, or undefined when the
 * token is missing/unparseable.
 */
export function tokenToEpochMs(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const parts = token.split(";");
  const ticks = parts[3];
  if (ticks === undefined || ticks === "") return undefined;
  const t = Number(ticks);
  if (!Number.isFinite(t)) return undefined;
  return (t - EPOCH_TICKS) / TICKS_PER_MS;
}

/** Render a change token's timestamp as an ISO-8601 UTC string. */
export function tokenToIso(token: string | undefined): string | undefined {
  const ms = tokenToEpochMs(token);
  if (ms === undefined) return undefined;
  return new Date(ms).toISOString();
}
