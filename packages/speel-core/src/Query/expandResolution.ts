// src/Query/expandResolution.ts
import type { EntityType } from "../Metadata/EntityType.js";
import { InvalidOperationException } from "../errors.js";

/**
 * Resolve the select fields for an expand of `navName` on `et`. Mirrors the
 * default behavior used by Query.expand: explicit fields win; otherwise a nav
 * whose target is provider-routed (a person column) defaults to the target's
 * full column set and a list lookup to its display field.
 */
export function resolveExpandFields(
  et: EntityType,
  navName: string,
  explicitFields?: readonly string[],
): readonly string[] {
  if (explicitFields && explicitFields.length > 0) return explicitFields;
  const nav = et.findNavigation(navName);
  if (!nav) {
    throw new InvalidOperationException(
      `expand('${navName}'): no navigation registered on ${et.ctor.name}.`,
    );
  }
  // A provider-routed target expands to the target's whole column set; which of
  // those an inline expand can project is the wire's business, and the provider
  // drops what it cannot (the clause carries the source so it knows to).
  if (nav.target.source.kind === "provider") return nav.target.columnNames;
  // A list lookup projects its key as well as its display field. Without the key the
  // expanded object is `{ Title }` with no id: a picker cannot match it to the target's
  // own rows (so it shows the held value twice), and a save that derives the FK from
  // the navigation has no id to derive it from.
  const key = nav.target.key.columnName;
  const fkConfig = nav.foreignKey.config;
  const display =
    fkConfig.kind === "Lookup" ? (fkConfig.displayField ?? "Title") : "Title"; // FK columns are always Lookup; defensive fallback.
  return display === key ? [key] : [key, display];
}

/**
 * The column an expand of `navName` addresses. $expand takes the lookup COLUMN's
 * internal name, which hasColumnName can make differ from the in-memory nav name.
 */
export function resolveExpandColumn(et: EntityType, navName: string): string {
  return et.findNavigation(navName)?.columnName ?? navName;
}
