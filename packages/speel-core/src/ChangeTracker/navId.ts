/** The id(s) a navigation value resolves to: object → .Id, array → sorted [.Id], null/undefined → null. */
export function navIdOf(value: unknown): number | number[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    return value
      .map((o) => (o as { Id?: number }).Id)
      .filter((id): id is number => id != null)
      .sort((a, b) => a - b);
  }
  return (value as { Id?: number }).Id ?? null;
}

/**
 * A navigation's id(s) as an array, whatever its cardinality. A nav id is scalar for
 * `kind: 'reference'` and an array for `kind: 'collection'` — and those two shapes both
 * reach the inverse-fk fixup passes, because a one-to-one whose FK lives on the other
 * entity is `kind: 'reference'` + `storage: 'inverse-fk'`. Membership diffing is written
 * against arrays, so normalize here rather than assuming cardinality from storage.
 */
export function navIdsOf(
  value: number | number[] | null | undefined,
): number[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function navIdsEqual(
  a: number | number[] | null,
  b: number | number[] | null,
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}
