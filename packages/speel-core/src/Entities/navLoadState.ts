/**
 * Which navigations are known to be loaded on an object — set when a load assigns
 * one, and carried by clone/deserialize onto the copies they make. It is what
 * tells a cleared navigation (`null` after a load) apart from one that was never
 * loaded (`null` from a class initializer) when the FK alone cannot.
 */
const loaded = new WeakMap<object, Set<string>>();

export function markNavLoadedOn(entity: object, navName: string): void {
  let names = loaded.get(entity);
  if (!names) loaded.set(entity, (names = new Set()));
  names.add(navName);
}

export function isNavLoadedOn(entity: object, navName: string): boolean {
  return loaded.get(entity)?.has(navName) === true;
}
