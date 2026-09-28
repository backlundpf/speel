import type { EntityType } from "../Metadata/EntityType.js";
import type { Property } from "../Metadata/Property.js";
import type { IWriteField } from "../providers/ISharePointProvider.js";

/**
 * The user's `codec.toProvider`: a model type → the field's typed value (the
 * sample's `CategoryOption` → `"eng"`). The only conversion core applies on the
 * way out — never `toWire`, which belongs to a Json column's own contents; the
 * provider spells the wire from the Property it is handed. null/undefined carry
 * no model value to convert — pass them through (mirrors Materialize's read-path
 * guard). undefined is skipped by the caller; null is an explicit clear.
 *
 * The element-wise map below is for a multi-VALUED column (multi-Lookup,
 * multi-Choice): each array element is its own wire value, converted on its own.
 * A Json field's codec is different — for a MultiJsonField the array IS the
 * value, one JSON string holding every element, so it must go to `toProvider`
 * whole rather than element by element.
 */
function toProviderValue(prop: Property, model: unknown): unknown {
  const toProvider = prop.codec?.toProvider;
  if (model === undefined || model === null || !toProvider) return model;
  if (prop.config.kind === "Json") return toProvider(model);
  return Array.isArray(model)
    ? model.map((x) => toProvider(x))
    : toProvider(model);
}

/**
 * An entity's writable columns as typed fields — the model's own `Property` and
 * the typed value — for the provider to encode. Keys and read-only columns never
 * go across; the provider reads `property.columnName` and `property.config`.
 */
export const PayloadBuilder = {
  buildForAdd(entity: object, et: EntityType): IWriteField[] {
    const e = entity as Record<string, unknown>;
    const out: IWriteField[] = [];
    for (const p of et.properties) {
      if (p.key || p.readOnly) continue;
      const value = toProviderValue(p, e[p.propertyName]);
      // An insert carries no unset field: there is no prior value to clear.
      if (value === undefined || value === null) continue;
      out.push({ property: p, value });
    }
    return out;
  },

  buildForUpdate(
    entity: object,
    et: EntityType,
    dirtyColumnNames: readonly string[],
  ): IWriteField[] {
    const e = entity as Record<string, unknown>;
    const dirty = new Set(dirtyColumnNames);
    const out: IWriteField[] = [];
    for (const p of et.properties) {
      if (p.key || p.readOnly || !dirty.has(p.columnName)) continue;
      const value = toProviderValue(p, e[p.propertyName]);
      // null is an explicit clear and an empty array a multi-value clear; only
      // undefined is "nothing to say".
      if (value === undefined) continue;
      out.push({ property: p, value });
    }
    return out;
  },
};
