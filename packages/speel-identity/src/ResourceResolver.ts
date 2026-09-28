import {
  InvalidOperationException,
  type DbContext,
  type EntityCtor,
  type IEntity,
} from "@speel/core";
import type { ResolvedResource, ResourceRef } from "./resources.js";

/**
 * Turns a resource descriptor into the list-and-id pair the provider needs.
 *
 * Synchronous, because everything it needs is already in the model — which is what lets
 * `permissions.for(item(entity))` be an ordinary expression rather than something to await.
 */
export class ResourceResolver {
  constructor(private readonly db: DbContext) {}

  resolve(ref: ResourceRef): ResolvedResource {
    if (ref.kind !== "entity") return ref;

    const entity = ref.entity as IEntity;
    const name = entity.constructor.name;
    const entityType = this.db.model.findEntityType(
      entity.constructor as EntityCtor,
    );

    if (entityType === undefined) {
      throw new InvalidOperationException(
        `${name} is not registered on this context, so it has no item to secure.`,
      );
    }
    if (entityType.source.kind !== "list") {
      throw new InvalidOperationException(
        `${name} is not mapped to a list, so it has no item-level permissions.`,
      );
    }
    if (entity.Id === undefined) {
      throw new InvalidOperationException(
        `This ${name} has no Id yet. Save it before setting permissions on it.`,
      );
    }

    const handle = entityType.source.list;
    if (handle.kind !== "title") {
      throw new InvalidOperationException(
        `${name} is bound to a list by id; permissions need its title.`,
      );
    }
    return { kind: "item", list: handle.value, id: entity.Id };
  }
}
