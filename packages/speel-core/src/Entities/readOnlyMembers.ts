import type { EntityType } from "../Metadata/EntityType.js";

/** Names of read-only (non-key) properties and read-only navigations holding a value. */
export function readOnlyMembersWithValues(
  et: EntityType,
  entity: object,
): string[] {
  const e = entity as Record<string, unknown>;
  const names: string[] = [];
  for (const p of et.properties)
    if (p.readOnly && !p.key && e[p.propertyName] != null)
      names.push(p.propertyName);
  for (const nav of et.navigations())
    if (nav.readOnly && e[nav.name] != null) names.push(nav.name);
  return names;
}

/**
 * Clear what a new row carried but the server did not take: read-only values are
 * never written, so after an insert they describe some other row. New rows are not
 * re-queried for these, so absent is the honest value.
 */
export function clearReadOnlyMembers(et: EntityType, entity: object): void {
  const e = entity as Record<string, unknown>;
  for (const p of et.properties)
    if (p.readOnly && !p.key) e[p.propertyName] = undefined;
  for (const nav of et.navigations()) if (nav.readOnly) e[nav.name] = undefined;
}
