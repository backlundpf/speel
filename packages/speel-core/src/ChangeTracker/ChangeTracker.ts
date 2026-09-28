// src/ChangeTracker/ChangeTracker.ts
import type { IEntity, EntityCtor } from "../types.js";
import type { Model } from "../Metadata/Model.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type { IStorageProvider } from "../providers/ISharePointProvider.js";
import type { INavigation } from "../Metadata/Navigation.js";
import { EntityEntry, EntityState, isPendingState } from "./EntityEntry.js";
import { persistedId } from "./entityKey.js";
import { Snapshot } from "./Snapshot.js";
import { recordId } from "../Cache/ICacheProvider.js";
import {
  InvalidOperationException,
  ModelConfigurationException,
  DataException,
} from "../errors.js";
import { Materialize } from "../Query/Materialize.js";
import { navIdOf, navIdsEqual, navIdsOf } from "./navId.js";

/** Loads one navigation's value for an entity. Supplied by DbContext. */
export type NavLoader = (nav: INavigation, entity: object) => Promise<unknown>;

export class ChangeTracker {
  /**
   * Every tracked entry, keyed by its entity instance. Map iteration is insertion-ordered,
   * so values() is the tracking order every pass below relies on, and entryFor() is O(1) —
   * track() calls it on every materialized row, so a linear scan would make materialization
   * quadratic. Keyed strongly on purpose: the entry it maps to holds `entity` anyway, so a
   * WeakMap here would buy no collectability while costing a second structure to maintain.
   */
  private readonly byEntity = new Map<object, EntityEntry>();
  /**
   * Identity map: entity type → id → entry. Nested rather than a `${ctor.name}|${id}` string
   * key so the outer key is ctor *identity* — two entity classes sharing a name across modules
   * would collide on the string form, as would any bundler that mangles class names.
   */
  private readonly byKey = new Map<EntityCtor, Map<number, EntityEntry>>();

  constructor(
    /** The model this tracker resolves entity types against. */
    readonly model: Model,
    private readonly provider?: IStorageProvider,
    private readonly navLoader?: NavLoader,
  ) {}

  /** The id→entry slots for `ctor`, created on demand. Read paths use `byKey.get()` directly. */
  private slotsFor(ctor: EntityCtor): Map<number, EntityEntry> {
    let slots = this.byKey.get(ctor);
    if (!slots) {
      slots = new Map<number, EntityEntry>();
      this.byKey.set(ctor, slots);
    }
    return slots;
  }

  private entityTypeFor<T extends IEntity>(ctor: EntityCtor<T>) {
    const et = this.model.findEntityType(ctor);
    if (!et) {
      throw new ModelConfigurationException(
        `Entity ${ctor.name} is not registered in the model.`,
      );
    }
    return et;
  }

  track<T extends IEntity>(
    entity: T,
    state: EntityState,
    snapshot?: Snapshot,
  ): EntityEntry<T> {
    const ctor = entity.constructor as EntityCtor<T>;
    const et = this.entityTypeFor(ctor);
    const id = persistedId(entity);

    // An entry may already exist for this exact instance — e.g. a Detached
    // bookkeeping entry created by entry() before add()/attach() ran. Promote it
    // in place rather than appending a second entry for the same object, which
    // would make entryFor() return whichever it happened to find first.
    const existingForInstance = this.entryFor(entity);
    if (existingForInstance) {
      // Claim the slot BEFORE mutating state/snapshot: if another entry already
      // owns it, this throws, and the pre-existing entry must be left untouched —
      // a caller that catches the exception must not be left with a phantom
      // promoted entry that hasChanges()/saveChangesAsync() would pick up.
      this.claimKey(ctor, id, state, existingForInstance as EntityEntry);
      existingForInstance.state = state;
      if (snapshot) existingForInstance.setSnapshot(snapshot);
      return existingForInstance;
    }

    let entry!: EntityEntry<T>;
    const reloadFn = this.provider
      ? () => this.reloadEntry(entry as EntityEntry)
      : undefined;
    entry = new EntityEntry<T>(
      entity,
      et,
      state,
      snapshot,
      reloadFn,
      this.navLoader,
    );
    this.claimKey(ctor, id, state, entry as EntityEntry);
    this.byEntity.set(entity as object, entry as EntityEntry);
    return entry;
  }

  /**
   * Claim `id`'s identity-map slot for `entry`. A Detached state never claims a
   * slot (it's bookkeeping only — see entry() — and must not occupy byKey, or a
   * later legitimate track() of a different instance for the same id would
   * wrongly collide with it, matching the read paths — DbSet.findAsync/
   * toArrayAsync, QueryExecutor, IncludeResolver — that already treat a Detached
   * entry as absent). Throws if a *different* entry already holds the slot;
   * re-claiming the slot `entry` already holds is not a collision.
   */
  private claimKey(
    ctor: EntityCtor,
    id: number | undefined,
    state: EntityState,
    entry: EntityEntry,
  ): void {
    if (state === EntityState.Detached) return;
    if (id === undefined) return;
    const slots = this.slotsFor(ctor);
    const other = slots.get(id);
    if (other && other !== entry) {
      throw new InvalidOperationException(
        `Entity ${ctor.name} with Id=${id} is already tracked.`,
      );
    }
    slots.set(id, entry);
  }

  private async reloadEntry(entry: EntityEntry): Promise<void> {
    if (!this.provider) {
      throw new InvalidOperationException(
        "Reload requires a provider on the tracker.",
      );
    }
    const id = persistedId(entry.entity as object);
    if (id === undefined) {
      throw new InvalidOperationException(
        `Cannot reload ${entry.entityType.ctor.name} with no Id.`,
      );
    }
    const record = await this.provider.getItemByIdAsync(
      entry.entityType.list,
      id,
      entry.entityType.columnNames as string[],
      { properties: entry.entityType.properties },
    );
    if (record === null) {
      throw new DataException(
        `Entity ${entry.entityType.ctor.name} with Id=${id} no longer exists on the server.`,
      );
    }
    // Re-materialize into the existing entity (in-place property assignment).
    const fresh = Materialize.item(record, entry.entityType);
    const target = entry.entity as Record<string, unknown>;
    const source = fresh as unknown as Record<string, unknown>;
    for (const p of entry.entityType.properties) {
      target[p.propertyName] = source[p.propertyName];
    }
    entry.refreshSnapshot();
    entry.state = EntityState.Unchanged;
  }

  /**
   * If an entity with the same (ctor, id) is already tracked, return that entry.
   * Otherwise track `entity` with the given state/snapshot.
   */
  findOrTrack<T extends IEntity>(
    ctor: EntityCtor<T>,
    entity: T,
    state: EntityState,
    snapshot?: Snapshot,
  ): EntityEntry<T> {
    const id = persistedId(entity);
    if (id !== undefined) {
      const existing = this.findEntry(ctor, id);
      if (existing) return existing;
    }
    return this.track(entity, state, snapshot);
  }

  findEntry<T extends IEntity>(
    ctor: EntityCtor<T>,
    id: number,
  ): EntityEntry<T> | undefined {
    return this.byKey.get(ctor as EntityCtor)?.get(id) as
      EntityEntry<T> | undefined;
  }

  /** Find the tracked entry for a specific entity instance (identity match). O(1). */
  entryFor<T extends IEntity>(entity: T): EntityEntry<T> | undefined {
    return this.byEntity.get(entity as object) as EntityEntry<T> | undefined;
  }

  /**
   * The entry for `entity`, creating a Detached bookkeeping entry if it is not
   * tracked. Detached entries are skipped by hasChanges(), fixupRelationships(),
   * captureInverseOriginals() and fixupInverseAsync(), so they never reach a save.
   */
  entry<T extends IEntity>(entity: T): EntityEntry<T> {
    return this.entryFor(entity) ?? this.track(entity, EntityState.Detached);
  }

  untrack(entry: EntityEntry): void {
    if (this.byEntity.get(entry.entity as object) === entry) {
      this.byEntity.delete(entry.entity as object);
    }
    const id = persistedId(entry.entity as object);
    if (id !== undefined) {
      this.byKey.get(entry.entityType.ctor as EntityCtor)?.delete(id);
    }
  }

  promoteKey(entry: EntityEntry, newId: number): void {
    const slots = this.slotsFor(entry.entityType.ctor as EntityCtor);
    if (slots.has(newId)) {
      throw new InvalidOperationException(
        `Cannot promote: id ${newId} already tracked for ${entry.entityType.ctor.name}.`,
      );
    }
    slots.set(newId, entry);
  }

  entries(): EntityEntry[];
  entries<T extends IEntity>(ctor: EntityCtor<T>): EntityEntry<T>[];
  entries<T extends IEntity>(ctor?: EntityCtor<T>): EntityEntry<T>[] {
    if (!ctor) return [...this.byEntity.values()] as EntityEntry<T>[];
    return [...this.byEntity.values()].filter(
      (e) => e.entityType.ctor === ctor,
    ) as EntityEntry<T>[];
  }

  hasChanges(): boolean {
    return [...this.byEntity.values()].some((e) => isPendingState(e.state));
  }

  /**
   * Reconcile each self-fk navigation with its FK column. The navigation wins:
   * a changed nav writes the FK; an unchanged nav leaves a directly-edited FK alone.
   * Added entities (no snapshot) always derive the FK from a set nav. Inverse
   * collections are reconciled separately (fixupInverseAsync), after parent ids exist.
   */
  fixupRelationships(): void {
    for (const entry of this.byEntity.values()) {
      if (
        entry.state === EntityState.Deleted ||
        entry.state === EntityState.Detached
      )
        continue;
      const e = entry.entity as Record<string, unknown>;
      for (const nav of entry.entityType.navigations()) {
        if (nav.readOnly || nav.storage === "inverse-fk") continue;
        const current = navIdOf(e[nav.name]);
        if (entry.state === EntityState.Added) {
          if (e[nav.name] != null) e[nav.foreignKey.propertyName] = current;
        } else if (!navIdsEqual(current, entry.originalNavId(nav.name))) {
          e[nav.foreignKey.propertyName] = current;
        }
      }
    }
  }

  /**
   * Snapshot every inverse-fk navigation's original member ids BEFORE the save flushes
   * (a flush calls reconcile → refreshSnapshot, overwriting the nav snapshot to the
   * post-save membership). `fixupInverseAsync` diffs against this captured map so an
   * existing parent re-parents correctly even when it also has a column change in the same
   * save. Added parents have no snapshot → empty originals (their whole collection is "added").
   *
   * `storage: 'inverse-fk'` is not the same axis as cardinality: a one-to-one whose FK lives
   * on the child is kind:'reference' + storage:'inverse-fk', and its nav id is a scalar. Both
   * shapes are normalized to number[] (navIdsOf) so the membership diff is uniform.
   */
  captureInverseOriginals(): Map<EntityEntry, Map<string, number[]>> {
    const out = new Map<EntityEntry, Map<string, number[]>>();
    for (const entry of this.byEntity.values()) {
      if (
        entry.state === EntityState.Deleted ||
        entry.state === EntityState.Detached
      )
        continue;
      for (const nav of entry.entityType.navigations()) {
        if (nav.storage !== "inverse-fk" || nav.readOnly) continue;
        const orig = navIdsOf(entry.originalNavId(nav.name));
        let m = out.get(entry);
        if (!m) {
          m = new Map();
          out.set(entry, m);
        }
        m.set(nav.name, orig);
      }
    }
    return out;
  }

  /**
   * Reconcile inverse-fk navigations: each member's child FK = parent.Id; a child no
   * longer a member has its FK nulled (or throws if the FK is statically required). Runs
   * after parent ids exist. `originals` comes from captureInverseOriginals() (taken before
   * the save flushed). Children are looked up among tracked entries or fetched by id.
   *
   * A child that has left the collection because it was DELETED is not an error: there is
   * no row left to write an FK to, so the whole removal branch — including the required-FK
   * refusal — is skipped for it. A child *joining* a collection still must exist.
   */
  async fixupInverseAsync(
    originals: ReadonlyMap<EntityEntry, ReadonlyMap<string, number[]>>,
  ): Promise<void> {
    for (const entry of this.byEntity.values()) {
      if (
        entry.state === EntityState.Deleted ||
        entry.state === EntityState.Detached
      )
        continue;
      const parentId = (entry.entity as { Id?: number }).Id;
      for (const nav of entry.entityType.navigations()) {
        if (nav.storage !== "inverse-fk" || nav.readOnly) continue;
        const e = entry.entity as Record<string, unknown>;
        const currentIds = navIdsOf(navIdOf(e[nav.name]));
        const originalIds = navIdsOf(originals.get(entry)?.get(nav.name));
        const originalSet = new Set(originalIds);
        const currentSet = new Set(currentIds);
        const added = currentIds.filter((id) => !originalSet.has(id));
        const removed = originalIds.filter((id) => !currentSet.has(id));
        const fk = nav.foreignKey.propertyName;
        for (const id of added) {
          const child = await this.trackedChild(
            nav.target.ctor as EntityCtor,
            id,
          );
          (child as Record<string, unknown>)[fk] = parentId;
        }
        for (const id of removed) {
          // Resolve BEFORE the required-FK refusal: an already-deleted child left the
          // collection by being deleted, and neither nulling its FK nor refusing to means
          // anything once its row is gone. Deleting the children and then the parent is
          // the ordinary teardown order, and a flushed delete untracks its entry, so a
          // membership diff taken against the pre-delete snapshot still names the child.
          const child = await this.findFixupChildAsync(
            nav.target.ctor as EntityCtor,
            id,
          );
          if (!child) continue;
          if (nav.foreignKey.required === true) {
            throw new InvalidOperationException(
              `Cannot remove ${nav.target.ctor.name} #${id} from ${entry.entityType.ctor.name}.${nav.name}: its ${fk} is required (reassign instead).`,
            );
          }
          (child as Record<string, unknown>)[fk] = null;
        }
      }
    }
  }

  /**
   * The child instance behind a fixup id: the tracked one if there is one, otherwise
   * fetched and tracked. `undefined` means the row is gone — providers return null from
   * getItemByIdAsync for a 404 only and rethrow every other failure, so this is "no such
   * item", never "the read failed".
   */
  private async findFixupChildAsync(
    ctor: EntityCtor,
    id: number,
  ): Promise<object | undefined> {
    const existing = this.findEntry(ctor, id);
    if (existing) return existing.entity;
    if (!this.provider) {
      throw new InvalidOperationException(
        `Inverse fixup for ${ctor.name} #${id} needs a provider.`,
      );
    }
    const et = this.entityTypeFor(ctor);
    const record = await this.provider.getItemByIdAsync(
      et.list,
      id,
      et.columnNames as string[],
      { properties: et.properties },
    );
    if (!record) return undefined;
    return this.materializeTracked(record, et) as object;
  }

  /**
   * @internal — resolve a raw provider record against the identity map: an
   * already-tracked instance wins (Detached counts as absent, matching every read
   * path); otherwise materialize, snapshot, and track a fresh Unchanged entity.
   */
  materializeTracked(record: Record<string, unknown>, et: EntityType): IEntity {
    const existing = this.findEntry(et.ctor as EntityCtor, recordId(record));
    if (existing && existing.state !== EntityState.Detached) {
      return existing.entity;
    }
    const entity = Materialize.item(record, et);
    this.track(entity, EntityState.Unchanged, Snapshot.take(entity, et));
    return entity;
  }

  /**
   * As findFixupChildAsync, but a missing row is a hard failure. Used for children
   * JOINING a collection: their FK write is the caller's instruction, and silently
   * dropping it would leave the save reporting success on a membership that never landed.
   */
  private async trackedChild(ctor: EntityCtor, id: number): Promise<object> {
    const child = await this.findFixupChildAsync(ctor, id);
    if (!child)
      throw new DataException(
        `${ctor.name} #${id} not found for inverse fixup.`,
      );
    return child;
  }

  detectChanges(): void {
    for (const e of this.byEntity.values()) {
      if (e.state !== EntityState.Unchanged && e.state !== EntityState.Modified)
        continue;
      const dirty = e.getDirtyColumns();
      e.state =
        dirty.length === 0 ? EntityState.Unchanged : EntityState.Modified;
    }
  }

  clear(): void {
    this.byEntity.clear();
    this.byKey.clear();
  }
}
