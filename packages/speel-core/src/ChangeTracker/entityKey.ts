// src/ChangeTracker/entityKey.ts

/**
 * The entity's persisted id, or undefined when it has none. Encodes the one rule
 * for "has this entity been saved": undefined, null, and 0 all mean unsaved —
 * SharePoint item ids start at 1, and a default-initialized `Id = 0` must not be
 * mistaken for a real key.
 */
export function persistedId(entity: object): number | undefined {
  const id = (entity as { Id?: number | null }).Id;
  return id === undefined || id === null || id === 0 ? undefined : id;
}
