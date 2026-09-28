/**
 * What a permission applies to. SharePoint's securables are uniform — a web, a list, an item —
 * so one descriptor covers every scope.
 *
 * Descriptors, not handles: `item(entity)` records the entity and resolves its list and id
 * later, which is the same late-resolution rule references follow and what lets a staged
 * change refer to something the same batch is about to create.
 */
export type ResourceRef =
  | { readonly kind: "web" }
  | { readonly kind: "list"; readonly list: string }
  | { readonly kind: "item"; readonly list: string; readonly id: number }
  | { readonly kind: "entity"; readonly entity: object };

/** What the provider sees: an entity descriptor has been resolved to a list and an id. */
export type ResolvedResource = Exclude<ResourceRef, { kind: "entity" }>;

/** The whole site's web — the default scope for a permission question. */
export const web = (): ResourceRef => ({ kind: "web" });

export const list = (title: string): ResourceRef => ({
  kind: "list",
  list: title,
});

export const itemIn = (listTitle: string, id: number): ResourceRef => ({
  kind: "item",
  list: listTitle,
  id,
});

/** An entity's own item scope; its list and id are resolved from the model when used. */
export const item = (entity: object): ResourceRef => ({
  kind: "entity",
  entity,
});

/** Stable identity, for grouping a save's operations and for keying permission caches. */
export function resourceKey(resource: ResolvedResource): string {
  switch (resource.kind) {
    case "web":
      return "web";
    case "list":
      return `list:${resource.list}`;
    case "item":
      return `item:${resource.list}:${resource.id}`;
  }
}
