import type { IEntity, EntityType } from "@speel/core";

/** Project an entity's column + navigation values into a propertyName-keyed record. */
export function projectEntityToValues(
  et: EntityType,
  entity: IEntity,
): Record<string, unknown> {
  const e = entity as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const prop of et.properties)
    out[prop.propertyName] = e[prop.propertyName];
  for (const nav of et.navigations()) out[nav.name] = e[nav.name];
  return out;
}

/** Apply a values record back onto the entity (only keys present in the record). */
export function applyValuesToEntity(
  et: EntityType,
  entity: IEntity,
  values: Record<string, unknown>,
): void {
  const e = entity as Record<string, unknown>;
  for (const prop of et.properties)
    if (prop.propertyName in values)
      e[prop.propertyName] = values[prop.propertyName];
  for (const nav of et.navigations())
    if (nav.name in values) e[nav.name] = values[nav.name];
}

/**
 * The FileDirRef folder convention: when the model explicitly surfaces a
 * FileDirRef property (SpeelEntity declares it visible:false, so
 * surfaced ⇔ isVisible !== false), its submitted value is a list-relative
 * folder placement — an add-option, never a column write. The key is stripped
 * from the applied values in ALL modes (changing placement on update would be
 * a move, which is deferred).
 */
export function consumeFolderValue(
  et: EntityType,
  values: Record<string, unknown>,
): { values: Record<string, unknown>; folder: string | undefined } {
  const prop = et.properties.find((p) => p.columnName === "FileDirRef");
  if (!prop || !(prop.propertyName in values))
    return { values, folder: undefined };
  const { [prop.propertyName]: raw, ...rest } = values;
  const folder =
    prop.visible !== false && typeof raw === "string" && raw.trim() !== ""
      ? raw
      : undefined;
  return { values: rest, folder };
}
