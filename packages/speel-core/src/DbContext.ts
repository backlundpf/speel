// src/DbContext.ts
import type { IEntity, EntityCtor, IDbContextOptions } from "./types.js";
import type { Model } from "./Metadata/Model.js";
import type { IStorageProvider } from "./providers/ISharePointProvider.js";
import { ModelBuilder } from "./ModelBuilder/ModelBuilder.js";
import { ENTITY_REGISTRY } from "./ModelBuilder/EntityTypeBuilder.js";
import { DbSet } from "./DbSet.js";
import {
  ChangeTracker,
  type NavLoader,
} from "./ChangeTracker/ChangeTracker.js";
import type { FilterBuilder } from "./Query/FilterBuilder.js";
import { SaveExecutor, type ISaveChangesOptions } from "./Save/SaveExecutor.js";
import {
  InvalidOperationException,
  ModelConfigurationException,
} from "./errors.js";
import { CacheCoordinator } from "./Cache/CacheCoordinator.js";
import type { EntityType } from "./Metadata/EntityType.js";
import {
  isPendingState,
  type EntityEntry,
} from "./ChangeTracker/EntityEntry.js";
import { persistedId } from "./ChangeTracker/entityKey.js";

/**
 * Hand-off from `createScope()` to the base constructor. Private `#fields` can only be
 * initialised by DbContext's own constructor, so createScope() parks the parent's shared
 * parts here, runs that constructor alone via Reflect.construct (the subclass
 * constructor, and its field initialisers, never run), and the constructor takes them.
 * Set and cleared synchronously around that one construct call.
 */
let scopeHandoff:
  | {
      readonly model: Model;
      readonly coordinator: CacheCoordinator | undefined;
    }
  | undefined;

export abstract class DbContext {
  /** @internal */ public readonly provider: IStorageProvider;

  readonly #sets = new Map<EntityCtor, DbSet<IEntity>>();
  readonly #setCtors = new Set<EntityCtor>();
  readonly #coordinator?: CacheCoordinator;
  #disposed = false;

  // The model (and everything derived from it) is built LAZILY, on first access —
  // after the subclass's `x = this.set(X)` field initializers have run. That scopes
  // the model to exactly the entities this context references, instead of merging in
  // every @Entity-registered class in the bundle (which leaked unrelated decorator
  // entities — and their nav targets — into every context).
  #built = false;
  #model?: Model;
  #changeTracker?: ChangeTracker;
  #saveExecutor?: SaveExecutor;

  constructor(options: IDbContextOptions) {
    const handoff = scopeHandoff;
    scopeHandoff = undefined;
    this.provider = options.provider;
    if (handoff) {
      // A scope: the model is the parent's (#ensureBuilt skips onModelCreating) and
      // the cache coordinator is shared, so a scope's save invalidates parent caches.
      this.#model = handoff.model;
      if (handoff.coordinator) this.#coordinator = handoff.coordinator;
    } else if (options.cache) {
      this.#coordinator = new CacheCoordinator(options.cache, this.provider);
    }
    // Model + change tracker + DbSets are built lazily; see #ensureBuilt().
  }

  #ensureBuilt(): void {
    if (this.#built) return;
    // A scope arrives with its parent's model and never runs onModelCreating.
    this.#model ??= this.#buildModel();
    this.#changeTracker = new ChangeTracker(
      this.#model,
      this.provider,
      this.#loadNavAsync,
    );
    this.#saveExecutor = new SaveExecutor(
      this.#model,
      this.provider,
      this.#changeTracker,
    );
    this.#built = true;
  }

  #buildModel(): Model {
    // onModelCreating is virtual and only writes to the builder; registering the
    // set()-declared ctors pulls their @Entity-built builders from the registry.
    const mb = new ModelBuilder();
    this.onModelCreating(mb);
    // Register set()-declared entities; a @Entity-decorated ctor arrives with its
    // builder from the registry, a fluent one declared in onModelCreating dedups.
    for (const ctor of this.#setCtors) mb.entity(ctor);
    return mb.build();
  }

  /**
   * Loads one navigation's value by reusing the DbSet/Query pipeline — paging,
   * materialization, identity-mapped tracking and container scope all come along.
   * A self-fk nav resolves its FK id(s) to the target object(s); an inverse-fk
   * collection queries the children that point back at this entity.
   */
  readonly #loadNavAsync: NavLoader = async (nav, entity) => {
    const target = this.set(nav.target.ctor as EntityCtor<IEntity>);
    const fkName = nav.foreignKey.propertyName;
    const empty = nav.kind === "collection" ? [] : undefined;

    if (nav.storage === "inverse-fk") {
      const parentId = persistedId(entity);
      if (parentId === undefined) return empty;
      const children = await target
        .where((b) =>
          (b as unknown as FilterBuilder<Record<string, number>>)[fkName]!.in([
            parentId,
          ]),
        )
        .toArrayAsync();
      return nav.kind === "collection" ? children : children[0];
    }

    const fk = (entity as Record<string, unknown>)[fkName];
    if (fk == null) return empty;
    const ids = (Array.isArray(fk) ? fk : [fk]) as number[];
    if (ids.length === 0) return empty;
    const rows = await target
      .where((b) => (b as unknown as FilterBuilder<{ Id: number }>).Id.in(ids))
      .toArrayAsync();
    return nav.kind === "collection" ? rows : rows[0];
  };

  /** The built model — entity types, properties, navigations. */
  public get model(): Model {
    this.#ensureBuilt();
    return this.#model!;
  }
  public get changeTracker(): ChangeTracker {
    this.#ensureBuilt();
    return this.#changeTracker!;
  }
  /**
   * Returns the DbSet for an entity type registered in onModelCreating.
   * Public EF-style generic set accessor — mirrors EF Core's `Set<T>()`.
   */
  public set<T extends IEntity>(ctor: EntityCtor<T>): DbSet<T> {
    const registered = ENTITY_REGISTRY.get(ctor as never);
    if (registered?.isEmbedded) {
      throw new ModelConfigurationException(
        `${(ctor as { name: string }).name} is a shape: it is embedded in a column, so there is no set of them to read. Reference it from a @JsonField instead.`,
      );
    }
    this.#setCtors.add(ctor as EntityCtor);
    let s = this.#sets.get(ctor as EntityCtor);
    if (!s) {
      // Lazy DbSet: model/tracker/coordinator resolve on first use, after the model
      // is built (which happens once all `x = this.set(X)` field initializers have run).
      s = new DbSet<IEntity>(
        ctor as EntityCtor<IEntity>,
        () => this.model,
        this.provider,
        () => this.changeTracker,
        () => this._assertNotDisposed(),
        () => this.#coordinator,
      );
      this.#sets.set(ctor as EntityCtor, s);
    }
    return s as unknown as DbSet<T>;
  }

  /** The change-tracker entry for `entity` — the handle for explicit relationship loading. */
  public entry<T extends IEntity>(entity: T): EntityEntry<T> {
    this._assertNotDisposed();
    return this.changeTracker.entry(entity);
  }

  /**
   * A unit of work over this context's model, provider and caches, with its own change
   * tracker, identity map and save executor. Use it exactly like the parent:
   * `scope.projects`, `scope.set(X)`, queries, `add` / `update` / `remove`, `entry()`
   * and `saveChangesAsync()`, which flushes only what was done through the scope and
   * none of the parent's pending changes.
   *
   * The scope is an instance of this context's class, but the subclass constructor
   * does not run and `onModelCreating` never runs for it. Every own `DbSet` property
   * (`projects = this.set(Project)`) is rebound to the scope's own set; any other own
   * property (services, helpers, constructor arguments) is shared by reference. A set
   * reached through a getter or helper is still the parent's, so `scope.set(X)` is
   * always the correct route. Private `#fields` declared by a subclass are not
   * initialised on a scope.
   *
   * Scopes are isolated, like two contexts over one database:
   * - there is no merge-back: the parent learns nothing when a scope saves;
   * - a row the scope created is safe to hand to the parent as a navigation value:
   *   the parent's save derives the FK from the row's `Id` and never attaches it;
   * - a parent instance of a row the scope updated is stale until re-read (its caches
   *   are already invalidated, because the cache coordinator is shared).
   *
   * A scope can create its own scope. Disposing either side touches only itself.
   */
  public createScope(): this {
    this._assertNotDisposed();
    scopeHandoff = { model: this.model, coordinator: this.#coordinator };
    let scope: this;
    try {
      // Runs only the base constructor; new.target gives the scope this.constructor's
      // prototype, so `scope instanceof ParentCtx` holds.
      scope = Reflect.construct(
        DbContext,
        [{ provider: this.provider }],
        this.constructor,
      ) as this;
    } finally {
      scopeHandoff = undefined;
    }
    for (const key of Reflect.ownKeys(this)) {
      if (key === "provider") continue; // set by the base constructor
      const desc = Object.getOwnPropertyDescriptor(this, key)!;
      if ("value" in desc && desc.value instanceof DbSet) {
        desc.value = scope.set(desc.value.ctor as EntityCtor);
      }
      Object.defineProperty(scope, key, desc);
    }
    return scope;
  }

  protected onModelCreating(_builder: ModelBuilder): void {
    /* no-op */
  }

  async saveChangesAsync(options?: ISaveChangesOptions): Promise<number> {
    this._assertNotDisposed();
    this.#ensureBuilt();
    const touched = this.#coordinator ? this.#collectCachedTouched() : [];
    const n = await this.#saveExecutor!.saveChangesAsync(options);
    // Independent per-list invalidations — no ordering to preserve.
    await Promise.all(
      touched.map((et) => this.#coordinator!.markStaleAsync(et)),
    );
    return n;
  }

  #collectCachedTouched(): EntityType[] {
    const out = new Set<EntityType>();
    for (const e of this.changeTracker.entries()) {
      if (isPendingState(e.state) && e.entityType.cache) out.add(e.entityType);
    }
    return [...out];
  }

  dispose(): void {
    if (this.#disposed) return;
    if (this.#built) this.#changeTracker!.clear(); // nothing to clear if the model was never built
    this.#disposed = true;
  }

  [Symbol.dispose](): void {
    this.dispose();
  }

  /** @internal */ _assertNotDisposed(): void {
    if (this.#disposed) {
      throw new InvalidOperationException("DbContext has been disposed.");
    }
  }
}
