import type { EntityCtor, IEntity } from "../types.js";
import type { SpecialExpand } from "../Query/SpecialExpand.js";
import { ModelConfigurationException } from "../errors.js";
import { EntityType } from "./EntityType.js";
import { listKey } from "../Cache/listKey.js";

export class Model {
  public readonly entityTypes: ReadonlyArray<EntityType>;
  private readonly byCtor: ReadonlyMap<EntityCtor, EntityType>;
  private readonly specialExpands: ReadonlyMap<string, SpecialExpand>;

  constructor(
    entityTypes: ReadonlyArray<EntityType>,
    specialExpands: ReadonlyMap<string, SpecialExpand> = new Map(),
  ) {
    this.specialExpands = specialExpands;
    const ctorMap = new Map<EntityCtor, EntityType>();
    const listKeys = new Set<string>();
    for (const et of entityTypes) {
      if (ctorMap.has(et.ctor)) {
        throw new ModelConfigurationException(
          `Entity ${et.ctor.name} registered more than once.`,
        );
      }
      ctorMap.set(et.ctor, et);
      if (et.source.kind === "list") {
        const lk = listKey(et.source.list);
        if (listKeys.has(lk)) {
          throw new ModelConfigurationException(
            `Multiple entities mapped to the same SP list (${lk}).`,
          );
        }
        listKeys.add(lk);
      }
    }
    this.byCtor = ctorMap;
    this.entityTypes = Object.freeze([...entityTypes]);
    Object.freeze(this);
  }

  findEntityType<T extends IEntity>(
    ctor: EntityCtor<T>,
  ): EntityType<T> | undefined {
    return this.byCtor.get(ctor as EntityCtor) as EntityType<T> | undefined;
  }

  /** The registered special expandable behind `name`, if any (see SpecialExpand). */
  findSpecialExpand(name: string): SpecialExpand | undefined {
    return this.specialExpands.get(name);
  }
}
