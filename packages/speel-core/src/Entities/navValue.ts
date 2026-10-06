import type { INavigation } from "../Metadata/Navigation.js";

/**
 * Whether a navigation's value means "not loaded" rather than "empty". Entities
 * commonly initialize navigations to null, so null alone is ambiguous: it is
 * unloaded on an inverse-fk navigation (nothing on this side says otherwise) and
 * when this side's FK still points somewhere. [] and null-with-empty-FK are real
 * empties.
 */
export function isUnloadedNavValue(
  nav: INavigation,
  owner: Record<string, unknown>,
): boolean {
  const value = owner[nav.name];
  if (value === undefined) return true;
  if (value !== null) return false;
  if (nav.storage === "inverse-fk") return true;
  const fk = owner[nav.foreignKey.propertyName];
  return Array.isArray(fk) ? fk.length > 0 : fk != null;
}
