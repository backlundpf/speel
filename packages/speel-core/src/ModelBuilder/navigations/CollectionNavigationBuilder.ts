import type { IEntity, EntityCtor } from "../../types.js";
import {
  captureName,
  type INavConfig,
  RelationshipBuilder,
} from "./NavConfig.js";
import { newFieldStateDraft } from "../fieldTypes/FieldStateBuilder.js";

export class CollectionNavigationBuilder<TSelf, TNav extends IEntity> {
  private readonly cfg: INavConfig;

  constructor(
    navName: string,
    target: EntityCtor<TNav> | (() => EntityCtor<TNav>),
  ) {
    // A class ctor has a defined `prototype`; an arrow thunk `() => Ctor` does not.
    const thunk: () => EntityCtor<IEntity> =
      typeof target === "function" &&
      (target as { prototype?: unknown }).prototype === undefined
        ? (target as () => EntityCtor<IEntity>)
        : () => target as EntityCtor<IEntity>;
    let resolved: EntityCtor<IEntity> | undefined;
    this.cfg = {
      name: navName,
      kind: "collection",
      isMultiValue: false,
      fieldState: newFieldStateDraft(),
      get targetCtor(): EntityCtor<IEntity> {
        return (resolved ??= thunk());
      },
    };
  }

  /** Inverse is a collection: multi-value lookup array on THIS entity. (many-to-many) */
  withMany(
    inverse?: (n: TNav) => unknown,
  ): RelationshipBuilder<TSelf, TNav, number[]> {
    this.cfg.foreignKeySide = "self";
    this.cfg.isMultiValue = true;
    if (inverse) this.cfg.inverseNavName = captureName(inverse);
    return new RelationshipBuilder<TSelf, TNav, number[]>(this.cfg);
  }

  /** Inverse is a reference: FK is a scalar on the CHILD (target) entity. (one-to-many) */
  withOne(
    inverse?: (n: TNav) => unknown,
  ): RelationshipBuilder<TNav, TNav, number> {
    this.cfg.foreignKeySide = "child";
    if (inverse) this.cfg.inverseNavName = captureName(inverse);
    return new RelationshipBuilder<TNav, TNav, number>(this.cfg);
  }

  /** @internal */ getConfig(): INavConfig {
    return this.cfg;
  }
}
