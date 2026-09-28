// src/ChangeTracker/EntityEntry.ts
import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type { INavigation } from "../Metadata/Navigation.js";
import { Snapshot } from "./Snapshot.js";
import { InvalidOperationException } from "../errors.js";
import type { IStagedFile } from "../Save/fileUpload.js";
import type { NavLoader } from "./ChangeTracker.js";
import { navIdOf } from "./navId.js";
import { persistedId } from "./entityKey.js";
import { captureSelectorName } from "../Metadata/selectorName.js";
import { ReferenceEntry, CollectionEntry } from "./NavigationEntry.js";

export enum EntityState {
  Detached = "Detached",
  Unchanged = "Unchanged",
  Added = "Added",
  Modified = "Modified",
  Deleted = "Deleted",
}

/** True for the states a save will process: Added, Modified, Deleted. */
export function isPendingState(state: EntityState): boolean {
  return (
    state === EntityState.Added ||
    state === EntityState.Modified ||
    state === EntityState.Deleted
  );
}

export class EntityEntry<T extends IEntity = IEntity> {
  public state: EntityState;
  private snapshot: Snapshot | undefined;

  /**
   * Save-time folder placement (list-relative, already normalized). Honored on
   * Added entries only — it is a placement instruction, not an entity field, so
   * it is never snapshotted, diffed, or written as a column value.
   */
  public targetFolder: string | undefined = undefined;

  /**
   * Save-time file upload (resolved name + content + upload options). Honored on
   * Added entries only — like targetFolder, it is a placement instruction, not an
   * entity field: never snapshotted, diffed, or written as a column value.
   */
  public targetFile: IStagedFile | undefined = undefined;

  /**
   * Save-time delete mode. Honored on Deleted entries only: false (the default)
   * recycles the item, true destroys it. Like targetFolder/targetFile this is an
   * instruction, not an entity field — never snapshotted, diffed, or written.
   */
  public permanentDelete: boolean = false;

  constructor(
    public readonly entity: T,
    public readonly entityType: EntityType<T>,
    initialState: EntityState,
    initialSnapshot: Snapshot | undefined,
    private readonly reloadFn?: () => Promise<void>,
    private readonly navLoader?: NavLoader,
  ) {
    this.state = initialState;
    this.snapshot = initialSnapshot;
  }

  readonly #loadedNavs = new Set<string>();

  isNavLoaded(navName: string): boolean {
    return this.#loadedNavs.has(navName);
  }

  /**
   * Populate one navigation. A load that finds nothing still marks the
   * navigation loaded — "there is nothing there" is a result, which is why
   * isLoaded is tracked rather than derived from the value being non-null.
   */
  async loadNavAsync(nav: INavigation, force: boolean): Promise<void> {
    if (this.#loadedNavs.has(nav.name) && !force) return;
    if (!this.navLoader) {
      throw new InvalidOperationException(
        `Loading navigation '${nav.name}' requires the entry to be tracked by a ChangeTracker with a ` +
          `navigation loader. When using DbContext, this is wired automatically.`,
      );
    }
    const value = await this.navLoader(nav, this.entity as object);
    (this.entity as unknown as Record<string, unknown>)[nav.name] = value;
    this.#loadedNavs.add(nav.name);
    this.markNavLoaded(nav.name);
  }

  #navigation(selector: ((e: T) => unknown) | string): INavigation {
    const name =
      typeof selector === "string"
        ? selector
        : captureSelectorName(selector as (e: never) => unknown);
    const nav = this.entityType.findNavigation(name);
    if (!nav) {
      throw new InvalidOperationException(
        `'${name}' is not a navigation on ${this.entityType.ctor.name}.`,
      );
    }
    return nav;
  }

  /** Handle for a reference navigation (hasOne). */
  reference<TTarget = IEntity>(
    selector: ((e: T) => unknown) | string,
  ): ReferenceEntry<TTarget, T> {
    const nav = this.#navigation(selector);
    if (nav.kind !== "reference") {
      throw new InvalidOperationException(
        `Navigation '${nav.name}' on ${this.entityType.ctor.name} is a collection — use collection() instead.`,
      );
    }
    return new ReferenceEntry<TTarget, T>(this, nav);
  }

  /** Handle for a collection navigation (hasMany, including multi-value lookups). */
  collection<TTarget = IEntity>(
    selector: ((e: T) => unknown) | string,
  ): CollectionEntry<TTarget, T> {
    const nav = this.#navigation(selector);
    if (nav.kind !== "collection") {
      throw new InvalidOperationException(
        `Navigation '${nav.name}' on ${this.entityType.ctor.name} is a reference — use reference() instead.`,
      );
    }
    return new CollectionEntry<TTarget, T>(this, nav);
  }

  get isKeySet(): boolean {
    return persistedId(this.entity as object) !== undefined;
  }

  get originalValues(): Readonly<Partial<T>> {
    return (this.snapshot?.values as Partial<T>) ?? ({} as Partial<T>);
  }

  get currentValues(): Readonly<Partial<T>> {
    const e = this.entity as unknown as Record<string, unknown>;
    const v: Record<string, unknown> = {};
    for (const p of this.entityType.properties)
      v[p.propertyName] = e[p.propertyName];
    return v as Partial<T>;
  }

  getDirtyColumns(): string[] {
    if (!this.snapshot) return [];
    return this.snapshot.diffDirtyColumns(this.entity, this.entityType);
  }

  /** Original (snapshotted) id(s) for a navigation; null when no snapshot (Added). */
  originalNavId(navName: string): number | number[] | null {
    return this.snapshot?.navIds[navName] ?? null;
  }

  /**
   * @internal — like setSnapshot, this writes tracking state directly and does not
   * validate `navName` against entityType.navigations(); a typo would silently add a
   * junk key to the snapshot. Callers must pass a real navigation name (loadNavAsync
   * passes `nav.name` straight off the metadata).
   *
   * Record the currently-assigned value of `navName` as its original state.
   * Never calls refreshSnapshot() — that would rebuild the whole snapshot and
   * silently discard pending scalar edits. Entries with no snapshot (Added,
   * Detached) have no original state to correct, so this is a no-op for them.
   */
  markNavLoaded(navName: string): void {
    if (!this.snapshot) return;
    const value = (this.entity as unknown as Record<string, unknown>)[navName];
    this.setSnapshot(this.snapshot.setNavId(navName, navIdOf(value)));
  }

  /**
   * @internal — record new original values for the named properties, leaving the
   * rest of the snapshot (and any pending edits to it) alone. For values the
   * SERVER changed out from under a tracked entity — a file rename rewriting
   * FileLeafRef/FileRef — where refreshSnapshot() would be wrong: it would adopt
   * the caller's unsaved edits as the original state. Entries with no snapshot
   * (Added, Detached) have nothing to correct, so this is a no-op for them.
   */
  reviseOriginals(patch: Readonly<Record<string, unknown>>): void {
    if (!this.snapshot) return;
    this.setSnapshot(this.snapshot.setValues(patch));
  }

  refreshSnapshot(): void {
    this.snapshot = Snapshot.take(this.entity, this.entityType);
  }

  clearSnapshot(): void {
    this.snapshot = undefined;
  }

  /** @internal — used by ChangeTracker when promoting a Detached entry. */
  setSnapshot(snapshot: Snapshot): void {
    this.snapshot = snapshot;
  }

  async reload(): Promise<void> {
    if (!this.reloadFn) {
      throw new InvalidOperationException(
        `Reload() requires the entry to be tracked by a ChangeTracker with a provider. ` +
          `When using DbContext, this is wired automatically.`,
      );
    }
    await this.reloadFn();
    this.#loadedNavs.clear();
  }
}
