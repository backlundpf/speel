import type { IEntity, EntityCtor } from "../../types.js";
import {
  captureName,
  type INavConfig,
  RelationshipBuilder,
} from "./NavConfig.js";
import { newFieldStateDraft } from "../fieldTypes/FieldStateBuilder.js";

export class ReferenceNavigationBuilder<TSelf, TNav extends IEntity> {
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
      kind: "reference",
      isMultiValue: false,
      fieldState: newFieldStateDraft(),
      get targetCtor(): EntityCtor<IEntity> {
        return (resolved ??= thunk());
      },
    };
  }

  /** Inverse is a collection: FK is a scalar on THIS entity. (many-to-one) */
  withMany(
    inverse?: (n: TNav) => unknown,
  ): RelationshipBuilder<TSelf, TNav, number> {
    this.cfg.foreignKeySide = "self";
    if (inverse) this.cfg.inverseNavName = captureName(inverse);
    return new RelationshipBuilder<TSelf, TNav, number>(this.cfg);
  }

  /** Inverse is a reference: FK is a scalar on the TARGET entity. (one-to-one) */
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
