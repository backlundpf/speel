import type { EntityType } from "../Metadata/EntityType.js";
import { navIdOf } from "./navId.js";

function deepClone(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(deepClone);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = deepClone((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true; // null/undefined collapse
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i])) return false;
    return true;
  }
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null
  ) {
    // Only one of them is a Date or an array — the matched cases returned above.
    if (a instanceof Date || b instanceof Date) return false;
    if (Array.isArray(a) || Array.isArray(b)) return false;
    // An object-valued column — a Json field's shape instance, an object-valued
    // Choice — is compared structurally, because the snapshot holds a clone and
    // a clone is never the same object. Own ENUMERABLE keys only, recursing
    // through this same comparison so a nested Date or array keeps its meaning,
    // and the prototype is deliberately not part of it: `deepClone` answers a
    // plain object where the entity holds a shape instance.
    //
    // Symbol keys are ignored, which is exactly right: a shape instance's
    // unknown-key bag is symbol-keyed and non-enumerable, so a field only a
    // newer client knows about cannot make this client's row dirty. (Comparing
    // the serialized JSON instead would not work at all — `deepClone` drops the
    // bag, so snapshot and instance would differ by construction.)
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const aKeys = Object.keys(ao);
    if (aKeys.length !== Object.keys(bo).length) return false;
    for (const k of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
      if (!equal(ao[k], bo[k])) return false;
    }
    return true;
  }
  return false;
}

export class Snapshot {
  private constructor(
    public readonly values: Readonly<Record<string, unknown>>,
    public readonly navIds: Readonly<Record<string, number | number[] | null>>,
  ) {}

  static take(entity: object, entityType: EntityType): Snapshot {
    const e = entity as Record<string, unknown>;
    const v: Record<string, unknown> = {};
    for (const p of entityType.properties) {
      v[p.propertyName] = deepClone(e[p.propertyName]);
    }
    const n: Record<string, number | number[] | null> = {};
    for (const nav of entityType.navigations())
      n[nav.name] = navIdOf(e[nav.name]);
    return new Snapshot(Object.freeze(v), Object.freeze(n));
  }

  diffDirtyColumns(entity: object, entityType: EntityType): string[] {
    const e = entity as Record<string, unknown>;
    const dirty: string[] = [];
    for (const p of entityType.properties) {
      if (p.key) continue;
      if (!equal(e[p.propertyName], this.values[p.propertyName])) {
        dirty.push(p.columnName);
      }
    }
    return dirty;
  }

  /**
   * Replace one navigation's recorded id(s). Used when an explicit load
   * populates a navigation, so the loaded state becomes the original and the
   * save-time membership diff does not see it as newly added.
   */
  setNavId(navName: string, id: number | number[] | null): Snapshot {
    return new Snapshot(
      this.values,
      Object.freeze({ ...this.navIds, [navName]: id }),
    );
  }

  /**
   * Replace the recorded originals of specific properties, leaving every other
   * property (and the caller's pending edits to them) alone. Used when the
   * server changes a value out from under an entity that may already be dirty —
   * a file rename rewriting FileLeafRef/FileRef — where a whole-snapshot refresh
   * would silently adopt those pending edits as the original state.
   */
  setValues(patch: Readonly<Record<string, unknown>>): Snapshot {
    return new Snapshot(
      Object.freeze({ ...this.values, ...patch }),
      this.navIds,
    );
  }
}
