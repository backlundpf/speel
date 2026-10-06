import type { EntityType } from "../Metadata/EntityType.js";
import { cloneValue } from "./cloneValue.js";
import { isUnloadedNavValue } from "./navValue.js";
import { markNavLoadedOn } from "./navLoadState.js";

/**
 * A complete, untracked copy: every model property (key and read-only included)
 * deep-copied; navigations copied by reference — a collection gets a new array of
 * the same targets, because cloning a target would mint a second instance of a
 * tracked row.
 */
export function cloneEntity<T>(et: EntityType, entity: T): T {
  const src = entity as unknown as Record<string, unknown>;
  const out = new et.ctor() as unknown as Record<string, unknown>;
  for (const p of et.properties) {
    if (p.propertyName in src)
      out[p.propertyName] = cloneValue(src[p.propertyName]);
  }
  for (const nav of et.navigations()) {
    if (!(nav.name in src)) continue;
    const v = src[nav.name];
    out[nav.name] = Array.isArray(v) ? [...v] : v;
    if (!isUnloadedNavValue(nav, src)) markNavLoadedOn(out, nav.name);
  }
  return out as unknown as T;
}
