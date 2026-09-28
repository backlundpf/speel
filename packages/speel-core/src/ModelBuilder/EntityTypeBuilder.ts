// src/ModelBuilder/EntityTypeBuilder.ts
import type { IEntity, EntityCtor, IListHandle } from "../types.js";
import { EntityType } from "../Metadata/EntityType.js";
import type {
  EntitySource,
  IListProvisioning,
} from "../Metadata/EntityType.js";
import { Property } from "../Metadata/Property.js";
import { ModelConfigurationException } from "../errors.js";
import { captureSelectorName } from "../Metadata/selectorName.js";
import { PropertyBuilder, type PropertyBuilderFor } from "./PropertyBuilder.js";
import { JsonFieldBuilder } from "./fieldTypes/JsonFieldBuilder.js";
import { ReferenceNavigationBuilder } from "./navigations/ReferenceNavigationBuilder.js";
import { CollectionNavigationBuilder } from "./navigations/CollectionNavigationBuilder.js";
import type { INavConfig } from "./navigations/NavConfig.js";
import {
  COMPUTED_FILE_SIZE_COLUMN,
  DOCUMENT_BRAND,
} from "../documentColumns.js";
import type { ValidationRule } from "../Metadata/Validation.js";
import { CacheConfigBuilder, type ICacheConfig } from "./CacheConfigBuilder.js";
import type { AnyPB } from "./types.js";
import {
  decoratorAppliersOf,
  recordField,
  type DecoratorApplier,
} from "./decorators.js";

function captureName<T>(selector: (e: T) => unknown): string {
  return captureSelectorName(
    selector as (e: never) => unknown,
    (m) => new ModelConfigurationException(m),
    "Property selector did not access any property.",
  );
}

/**
 * Options for the @Entity class decorator: `source` is the general form (any
 * `EntitySource`), `list` the shorthand for a list source. With `list`, the
 * provisioning keys mirror the fluent `toList(handle, opts)` second argument, so
 * the decorator can express everything the builder can; they are inert at runtime
 * and read only by @speel/migrations when creating the list.
 */
type IEntityOpts = { cache?: ICacheConfig } & (
  | ({
      list: string | { title: string } | { id: string };
      source?: undefined;
    } & IListProvisioning)
  | { source: EntitySource; list?: undefined }
);

export class EntityTypeBuilder<T extends IEntity> {
  public readonly ctor: EntityCtor<T>;
  private list: IListHandle | undefined;
  private source: EntitySource | undefined;
  private keyPropertyName: string | undefined;
  private readonly pbs: Map<string, AnyPB> = new Map();
  private readonly navConfigs: INavConfig[] = [];
  /**
   * Inheritance depth of the class that declared each member (0 = this entity's
   * own, fluent included; 1 its parent...). Members emit in depth order, so an
   * entity's own columns come first and a base class's system members last.
   */
  private readonly memberDepth = new Map<string, number>();
  private replayDepth = 0;
  private synthesizedFks: Property[] = [];
  private readonly entityValidations: ValidationRule[] = [];
  private cacheConfig: ICacheConfig | undefined;

  constructor(ctor: EntityCtor<T>) {
    this.ctor = ctor;
  }

  /** The general form: any source the provider serves. `toList` is its list shorthand. */
  toProviderSource(source: EntitySource): this {
    this.source = source;
    this.list = source.kind === "list" ? source.list : undefined;
    return this;
  }

  toList(
    handle: string | { title: string } | { id: string },
    opts?: IListProvisioning,
  ): this {
    const list: IListHandle =
      typeof handle === "string"
        ? { kind: "title", value: handle }
        : "title" in handle
          ? { kind: "title", value: handle.title }
          : { kind: "id", value: handle.id };
    return this.toProviderSource({
      kind: "list",
      list,
      ...(opts !== undefined ? { provisioning: opts } : {}),
    });
  }

  /** @internal */
  getSource(): EntitySource | undefined {
    return this.source;
  }

  /** A shape: it lives inside a column, so it has no rows, no key and no navigations. */
  toEmbedded(): this {
    return this.toProviderSource({ kind: "embedded" });
  }

  /** @internal */
  get isEmbedded(): boolean {
    return this.source?.kind === "embedded";
  }

  /**
   * A SpeelDocument maps to a SharePoint document library, so provisioning infers
   * `documentLibrary` rather than making the author declare it twice — the class
   * already says so, through the static brand it carries (this module cannot import
   * SpeelDocument: its decorators lead back here). An explicit template always wins,
   * so a document can still be provisioned as a plain list if a site genuinely has
   * one that way.
   */
  private effectiveSource(): EntitySource {
    const source = this.source!;
    if (source.kind !== "list") return source;
    if (source.provisioning?.template !== undefined) return source;
    if (
      (this.ctor as unknown as { [DOCUMENT_BRAND]?: true })[DOCUMENT_BRAND] !==
      true
    )
      return source;
    return {
      ...source,
      provisioning: { ...source.provisioning, template: "documentLibrary" },
    };
  }

  hasKey(selector: ((e: T) => unknown) | string): this {
    this.keyPropertyName =
      typeof selector === "function" ? captureName(selector) : selector;
    return this;
  }

  // V is inferred directly from the selector's return type. (Using
  // `K extends keyof T` with `(e) => T[K]` lets TS widen K to the union of all
  // keys, collapsing PropertyBuilderFor<T[K]> to `unknown`.)
  property<V>(selector: ((e: T) => V) | string): PropertyBuilderFor<V> {
    const name =
      typeof selector === "function" ? captureName(selector) : selector;
    const existing = this.pbs.get(name);
    if (existing) return existing as unknown as PropertyBuilderFor<V>; // a refinement keeps the declaring depth
    const pb = new PropertyBuilder<V>(name);
    this.pbs.set(name, pb as unknown as AnyPB);
    this.memberDepth.set(name, this.replayDepth);
    return pb as unknown as PropertyBuilderFor<V>;
  }

  hasOne<TNav extends IEntity>(
    target: EntityCtor<TNav> | (() => EntityCtor<TNav>),
    selector: ((e: T) => TNav | null | undefined) | string,
  ): ReferenceNavigationBuilder<T, TNav> {
    const name =
      typeof selector === "function" ? captureName(selector) : selector;
    const nb = new ReferenceNavigationBuilder<T, TNav>(name, target);
    this.setNavConfig(nb.getConfig());
    return nb;
  }

  hasMany<TNav extends IEntity>(
    target: EntityCtor<TNav> | (() => EntityCtor<TNav>),
    selector: ((e: T) => readonly TNav[] | null | undefined) | string,
  ): CollectionNavigationBuilder<T, TNav> {
    const name =
      typeof selector === "function" ? captureName(selector) : selector;
    const nb = new CollectionNavigationBuilder<T, TNav>(name, target);
    this.setNavConfig(nb.getConfig());
    return nb;
  }

  /** Navigations merge by name — a later declaration (a subclass, a fluent override of a decorator) replaces an earlier one, as properties do, and is the declaration whose depth the member takes. */
  private setNavConfig(cfg: INavConfig): void {
    const i = this.navConfigs.findIndex((c) => c.name === cfg.name);
    if (i >= 0) this.navConfigs[i] = cfg;
    else this.navConfigs.push(cfg);
    this.memberDepth.set(cfg.name, this.replayDepth);
  }

  /** @internal — replay decorator appliers, each under the inheritance depth of the class that declared it. */
  replay(appliers: readonly DecoratorApplier[]): void {
    for (const { apply, depth } of appliers) {
      this.replayDepth = depth;
      try {
        apply(this);
      } finally {
        this.replayDepth = 0;
      }
    }
  }

  /** Stable order by declaring depth ascending: own members first, the deepest base's last. */
  private byDepth<M>(items: readonly M[], name: (m: M) => string): M[] {
    const depthOf = (m: M): number => this.memberDepth.get(name(m)) ?? 0;
    return [...items].sort((a, b) => depthOf(a) - depthOf(b));
  }

  hasValidation<E extends T = T>(
    predicate: (ctx: import("../types.js").FieldContext<E>) => boolean,
    message: string,
  ): this {
    this.entityValidations.push({
      validate: (ctx) =>
        predicate(ctx as import("../types.js").FieldContext<E>),
      message,
    });
    return this;
  }

  /** Opt this entity into list caching. Optionally shape the payload (expand) and set a TTL. */
  useCaching(
    configure?: ((c: CacheConfigBuilder<T>) => void) | ICacheConfig,
  ): this {
    // Accept nothing (defaults), a configure callback, or a pre-built config
    // object (the @Entity decorator's path). All routes normalize via build().
    const cb = new CacheConfigBuilder<T>(
      typeof configure === "object" ? configure : undefined,
    );
    if (typeof configure === "function") configure(cb);
    this.cacheConfig = cb.build();
    return this;
  }

  /** @internal */
  getListHandle(): IListHandle | undefined {
    return this.list;
  }

  /** @internal — the navigations this builder declared (decorators, then fluent), merged by name, in inheritance-depth order. */
  getNavConfigs(): readonly INavConfig[] {
    return this.byDepth(this.navConfigs, (c) => c.name);
  }

  /**
   * @internal — every Json property and the shape it names, for ModelBuilder.build()'s
   * transitive closure and its late `config.shape` resolution. It exists because the
   * shape thunk lives on the property's field-type builder, not on the property: only
   * `getTypeBuilder()` reaches a `JsonFieldBuilder`, the same accessor `build()` uses
   * to find each property's field-type builder.
   */
  getJsonShapeRefs(): {
    propertyName: string;
    thunk: () => EntityCtor<IEntity>;
  }[] {
    const refs: { propertyName: string; thunk: () => EntityCtor<IEntity> }[] =
      [];
    for (const pb of this.pbs.values()) {
      const tb = pb.getTypeBuilder();
      if (tb instanceof JsonFieldBuilder && tb.shapeThunk) {
        refs.push({ propertyName: pb.propertyName, thunk: tb.shapeThunk });
      }
    }
    return refs;
  }

  /**
   * @internal — ModelBuilder synthesizes FK columns per build; a builder shared between
   * models (the decorator registry) must not carry one model's columns into the next.
   */
  resetSynthesizedFks(): void {
    this.synthesizedFks = [];
  }

  /** @internal */
  getPropertyBuilders(): readonly AnyPB[] {
    return Array.from(this.pbs.values());
  }

  /** @internal — true if a property of this name was declared via property(...) or already synthesized. */
  hasProperty(name: string): boolean {
    return (
      this.pbs.has(name) ||
      this.synthesizedFks.some((p) => p.propertyName === name)
    );
  }

  /** @internal */
  findSynthesizedFk(name: string): Property | undefined {
    return this.synthesizedFks.find((p) => p.propertyName === name);
  }

  /** @internal — registers an FK column synthesized by ModelBuilder from a relationship. */
  addForeignKeyProperty(p: Property): void {
    this.synthesizedFks.push(p);
  }

  /** @internal */
  build(): EntityType<T> {
    if (!this.source) {
      throw new ModelConfigurationException(
        `Entity ${this.ctor.name} requires a source (toList/toProviderSource).`,
      );
    }

    if (this.isEmbedded) {
      if (this.getNavConfigs().length > 0) {
        const names = this.getNavConfigs()
          .map((c) => c.name)
          .join(", ");
        throw new ModelConfigurationException(
          `Shape ${this.ctor.name}: navigations (${names}) cannot live inside a shape — a relationship in a blob has no FK column and nothing to expand. Store a scalar and resolve it yourself.`,
        );
      }
      // Arity cannot answer this: a defaulted parameter counts as zero and an
      // optional one counts as more than zero, so `ctor.length` both passes
      // constructors that explode and rejects ones that would load fine. A load
      // builds a shape by calling `new`, so calling `new` is the honest test.
      // It runs a shape's constructor once, at model-build time — shapes are data
      // holders, and the alternative is refusing valid models.
      try {
        new (this.ctor as new () => unknown)();
      } catch (e) {
        throw new ModelConfigurationException(
          `Shape ${this.ctor.name} cannot be constructed with no arguments, which is how a load builds one from stored JSON: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // Resolve key name via hasKey or convention "Id" — a shape has no key at all.
    let keyName: string | undefined;
    if (!this.isEmbedded) {
      keyName = this.keyPropertyName;
      if (!keyName) {
        const probe = new this.ctor();
        if (!("Id" in probe)) {
          throw new ModelConfigurationException(
            `Entity ${this.ctor.name} has no key. Call hasKey(...) or add an 'Id' property.`,
          );
        }
        keyName = "Id";
      }
    }

    const props: Property[] = [];

    // The one definition of what the key column is, whether the key property was
    // declared explicitly or arrives by convention.
    const keyProperty = (): Property =>
      new Property({
        propertyName: keyName!,
        columnName: "ID",
        displayName: "ID",
        config: { kind: "Number" },
        required: true,
        readOnly: true,
        key: true,
      });

    if (!this.isEmbedded) {
      const keyAlreadyRegistered = Array.from(this.pbs.values()).some(
        (pb) => pb.propertyName === keyName,
      );
      if (!keyAlreadyRegistered) {
        props.push(keyProperty());
      }
    }

    // Own members first, inherited (base-class system members) last.
    for (const pb of this.byDepth(
      Array.from(this.pbs.values()),
      (pb) => pb.propertyName,
    )) {
      const tb = pb.getTypeBuilder();
      if (!tb) {
        throw new ModelConfigurationException(
          `Property '${pb.propertyName}' on ${this.ctor.name} has no Is* type binding.`,
        );
      }
      const isKey = pb.propertyName === keyName;
      props.push(isKey ? keyProperty() : tb.build(pb.propertyName, false));
    }

    // Synthesized FK columns (Lookup/User) from relationships.
    for (const fk of this.synthesizedFks) {
      props.push(fk);
    }

    // Validate: no duplicate column names, and no column SharePoint cannot $select
    const seen = new Set<string>();
    for (const p of props) {
      if (p.columnName === COMPUTED_FILE_SIZE_COLUMN) {
        throw new ModelConfigurationException(
          `Entity ${this.ctor.name}: property '${p.propertyName}' maps to '${COMPUTED_FILE_SIZE_COLUMN}', ` +
            `a computed SharePoint column that the REST list-items $select rejects at query time. ` +
            `Extend SpeelDocument and read its \`FileSize\` property (bytes) instead.`,
        );
      }
      if (seen.has(p.columnName)) {
        throw new ModelConfigurationException(
          `Entity ${this.ctor.name} has duplicate column name '${p.columnName}'.`,
        );
      }
      seen.add(p.columnName);
    }

    return new EntityType<T>({
      ctor: this.ctor,
      source: this.effectiveSource(),
      properties: props,
      validations: this.entityValidations,
      ...(this.cacheConfig !== undefined ? { cache: this.cacheConfig } : {}),
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Constructor = abstract new (...args: any[]) => unknown;

/** Entities declared via the @Entity decorator, keyed by their constructor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ENTITY_REGISTRY = new Map<Constructor, EntityTypeBuilder<any>>();

/**
 * Class decorator declaring an entity, its source (a list or a provider source), and optional caching.
 *
 * Generic over the constructor itself, not the instance: a stage-3 class decorator must return
 * `void | typeof Class`, and the class's static side (SpeelDocument's brand, an app's own statics)
 * is part of `typeof Class` — an `EntityCtor<T>` return type would not be assignable to it.
 */
export function Entity(opts: IEntityOpts) {
  return function <TCtor extends EntityCtor<IEntity>>(
    target: TCtor,
    context: ClassDecoratorContext<TCtor>,
  ): TCtor {
    const eb = new EntityTypeBuilder(target);
    if (opts.source !== undefined) {
      eb.toProviderSource(opts.source);
    } else {
      const { list, cache: _cache, source: _source, ...provisioning } = opts;
      eb.toList(
        list,
        Object.keys(provisioning).length > 0 ? provisioning : undefined,
      );
    }
    if (opts.cache) eb.useCaching(opts.cache);

    // Field decorators run before the class decorator, so every level's
    // appliers are recorded by now; replay them base first, this class last.
    eb.replay(decoratorAppliersOf(target, context.metadata ?? undefined));

    ENTITY_REGISTRY.set(target, eb);
    return target;
  };
}

/**
 * Class decorator declaring a shape: a type that lives inside a column rather than
 * owning rows. It takes the same field decorators an entity does, which is what lets
 * a form render one with no adapter.
 */
export function JsonShape() {
  return function <TCtor extends Constructor>(
    target: TCtor,
    context: ClassDecoratorContext<TCtor>,
  ): TCtor {
    const eb = new EntityTypeBuilder(target as never);
    eb.toEmbedded();
    eb.replay(decoratorAppliersOf(target, context.metadata ?? undefined));
    ENTITY_REGISTRY.set(target, eb);
    return target;
  };
}

/** Field decorator marking the key property (replaces the "Id" convention). */
export function Key(
  _t: unknown,
  ctx: ClassFieldDecoratorContext<unknown, unknown>,
): void {
  recordField(ctx, (eb) => {
    eb.hasKey(ctx.name as string);
  });
}
