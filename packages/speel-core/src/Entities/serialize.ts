import type { EntityType } from "../Metadata/EntityType.js";
import type { Property } from "../Metadata/Property.js";
import type { JsonFieldConfig } from "../Metadata/FieldConfig.js";
import type { EntityCtor } from "../types.js";
import { DataException } from "../errors.js";
import {
  shapeToPlain,
  shapeFromPlain,
} from "../ModelBuilder/fieldTypes/shapeCodec.js";
import { cloneValue } from "./cloneValue.js";
import type { NavigationMode } from "./SerializedEntity.js";
import { isUnloadedNavValue } from "./navValue.js";
import { markNavLoadedOn } from "./navLoadState.js";

/** The tracked instance for (ctor, id), if the context holds one. */
export type ResolveTracked = (
  ctor: EntityCtor,
  id: number,
) => object | undefined;

const each = (v: unknown, f: (x: unknown) => unknown): unknown =>
  Array.isArray(v) ? v.map(f) : f(v);

// speel's own JSON, the format a Json column holds: the kind's wire codec
// (DateTime ↔ ISO) and the shape codec's object level. The provider pair
// (toProvider/fromProvider) is the column's business and never runs here.
function writeValue(p: Property, v: unknown): unknown {
  if (v == null) return v;
  if (p.config.kind === "Json") {
    const shape = (p.config as JsonFieldConfig).shape;
    return each(v, (x) => shapeToPlain(shape, x));
  }
  const toWire = p.codec?.toWire;
  return toWire ? each(v, (x) => toWire(x)) : cloneValue(v);
}

function readValue(p: Property, v: unknown): unknown {
  if (v == null) return v;
  if (p.config.kind === "Json") {
    const shape = (p.config as JsonFieldConfig).shape;
    return each(v, (x) => shapeFromPlain(shape, x, p.propertyName));
  }
  const fromWire = p.codec?.fromWire;
  return fromWire ? each(v, (x) => fromWire(x)) : cloneValue(v);
}

const idOf = (target: unknown): number | undefined => {
  const id = (target as { Id?: number | null } | null)?.Id;
  return id == null || id === 0 ? undefined : id;
};

export function serializeEntity(
  et: EntityType,
  entity: object,
  mode: NavigationMode,
): Record<string, unknown> {
  const src = entity as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const p of et.properties) {
    const v = src[p.propertyName];
    if (v !== undefined) out[p.propertyName] = writeValue(p, v);
  }
  for (const nav of et.navigations()) {
    // An unloaded navigation is left out, so a null in the data always means
    // a real clear.
    if (isUnloadedNavValue(nav, src)) continue;
    const v = src[nav.name];
    // One level only in full mode: a target's own navigations are stubs, so a
    // cycle (Project → Department → Projects → …) cannot recurse.
    const target = (t: unknown): Record<string, unknown> | undefined => {
      const id = idOf(t);
      if (id === undefined) return undefined;
      return mode === "full"
        ? serializeEntity(nav.target, t as object, "stub")
        : { Id: id };
    };
    out[nav.name] =
      v === null
        ? null
        : Array.isArray(v)
          ? v.map(target).filter((x) => x !== undefined)
          : (target(v) ?? null);
  }
  return out;
}

export function deserializeEntity(
  et: EntityType,
  data: unknown,
  resolveTracked: ResolveTracked,
): object {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new DataException(
      `deserialize() on ${et.ctor.name}: expected an object.`,
    );
  }
  const src = data as Record<string, unknown>;
  const out = new et.ctor() as unknown as Record<string, unknown>;
  for (const p of et.properties) {
    if (p.propertyName in src)
      out[p.propertyName] = readValue(p, src[p.propertyName]);
  }
  for (const nav of et.navigations()) {
    if (!(nav.name in src)) continue;
    const v = src[nav.name];
    const target = (t: unknown): object => {
      const id = idOf(t);
      if (typeof t !== "object" || id === undefined) {
        throw new DataException(
          `deserialize() on ${et.ctor.name}: navigation '${nav.name}' needs objects with an Id.`,
        );
      }
      // A tracked row wins: deserialize never mutates what the context holds.
      const tracked = resolveTracked(nav.target.ctor, id);
      if (tracked) return tracked;
      if (Object.keys(t as object).length === 1) {
        const bare = new nav.target.ctor() as { Id?: number };
        bare.Id = id;
        return bare;
      }
      return deserializeEntity(nav.target, t, resolveTracked);
    };
    out[nav.name] =
      v === null ? null : Array.isArray(v) ? v.map(target) : target(v);
    markNavLoadedOn(out, nav.name);
  }
  return out;
}
