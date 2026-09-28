// src/DbSet.ts
import type { IEntity, EntityCtor } from "./types.js";
import type { Model } from "./Metadata/Model.js";
import type { EntityType } from "./Metadata/EntityType.js";
import type {
  IStorageProvider,
  IRenameResult,
} from "./providers/ISharePointProvider.js";
import { requireFileSystem } from "./providers/capabilities.js";
import { ChangeTracker } from "./ChangeTracker/ChangeTracker.js";
import { EntityState, EntityEntry } from "./ChangeTracker/EntityEntry.js";
import { persistedId } from "./ChangeTracker/entityKey.js";
import { Snapshot } from "./ChangeTracker/Snapshot.js";
import {
  ModelConfigurationException,
  InvalidOperationException,
} from "./errors.js";
import { Query, IncludableQuery } from "./Query/Query.js";
import { QueryExecutor } from "./Query/QueryExecutor.js";
import type { FilterBuilder } from "./Query/FilterBuilder.js";
import type { FilterNode } from "./Query/FilterNode.js";
import type { IQuery, NavTarget } from "./Query/IQuery.js";
import type { CacheCoordinator } from "./Cache/CacheCoordinator.js";
import { normalizeFolderPath, normalizeLeafName } from "./Save/folderPath.js";
import { resolveStagedFile, fileFactsPatch } from "./Save/fileUpload.js";
import type { IFileContent } from "./Save/fileUpload.js";
import { SpeelDocument } from "./SpeelDocument.js";

/**
 * SharePoint's checked-out-to column. The model member is `CheckedOutById`
 * (see SpeelDocument), so the column name is what identifies it in metadata.
 */
const CHECKOUT_USER_COLUMN = "CheckoutUserId";

/** Options for {@link DbSet.add}. The bag is the extension seam for future placement options. */
export interface IAddOptions {
  /** List-relative folder path, e.g. 'folder1/nested'. Created recursively on save if missing. */
  folder?: string;
  /** File content to upload (document libraries). The entity's fields become the file's metadata. */
  file?: IFileContent;
}

export class DbSet<T extends IEntity> implements IQuery<T> {
  // model/tracker/coordinator accept a value (eager — direct construction) or a thunk
  // (lazy — DbContext.set() hands out a DbSet before the model is built, then resolves
  // it on first use). A Model/ChangeTracker is an object; a thunk is a function.
  readonly #modelFn: () => Model;
  readonly #trackerFn: () => ChangeTracker;
  readonly #coordinatorFn: () => CacheCoordinator | undefined;
  #entityType?: EntityType<T>;
  #tracker?: ChangeTracker;

  constructor(
    public readonly ctor: EntityCtor<T>,
    model: Model | (() => Model),
    private readonly provider: IStorageProvider,
    tracker: ChangeTracker | (() => ChangeTracker),
    private readonly assertNotDisposed?: () => void,
    coordinator?: CacheCoordinator | (() => CacheCoordinator | undefined),
  ) {
    this.#modelFn = typeof model === "function" ? model : (): Model => model;
    this.#trackerFn =
      typeof tracker === "function" ? tracker : (): ChangeTracker => tracker;
    this.#coordinatorFn =
      typeof coordinator === "function"
        ? coordinator
        : (): CacheCoordinator | undefined => coordinator;
  }

  private get entityType(): EntityType<T> {
    if (!this.#entityType) {
      const et = this.#modelFn().findEntityType(this.ctor);
      if (!et)
        throw new ModelConfigurationException(
          `Entity ${this.ctor.name} is not registered.`,
        );
      this.#entityType = et;
    }
    return this.#entityType;
  }
  private get tracker(): ChangeTracker {
    return (this.#tracker ??= this.#trackerFn());
  }
  private get coordinator(): CacheCoordinator | undefined {
    return this.#coordinatorFn();
  }

  async findAsync(id: number): Promise<T | null> {
    this.assertNotDisposed?.();
    const tracked = this.tracker.findEntry(this.ctor, id);
    if (tracked && tracked.state !== EntityState.Detached)
      return tracked.entity as T;

    const record = await this.provider.getItemByIdAsync(
      this.entityType.sourceHandle,
      id,
      this.entityType.columnNames,
      { properties: this.entityType.properties },
    );
    if (record === null) return null;
    return this.tracker.materializeTracked(record, this.entityType) as T;
  }

  async toArrayAsync(): Promise<T[]> {
    this.assertNotDisposed?.();
    // The empty query state: no filter/order/skip/includes/expands, so the
    // executor's paging + identity-map + tracking loop is exactly this read.
    return this.toQuery().toArrayAsync();
  }

  async cacheAsync(): Promise<T[]> {
    this.assertNotDisposed?.();
    if (!this.coordinator) {
      throw new InvalidOperationException(
        `cacheAsync() requires a cache provider. Call useCaching(...) on the context builder.`,
      );
    }
    return (await this.coordinator.loadAllAsync(this.entityType)) as T[];
  }

  /**
   * Force the next cache read of this list to re-sync, ignoring its TTL — the public
   * mirror of the invalidation saveChangesAsync applies to lists it touched. For
   * out-of-band changes (another user, a flow, a "Refresh" action).
   */
  async markCacheStaleAsync(): Promise<void> {
    this.assertNotDisposed?.();
    if (!this.coordinator) {
      throw new InvalidOperationException(
        `markCacheStaleAsync() requires a cache provider. Call useCaching(...) on the context builder.`,
      );
    }
    if (!this.entityType.cache) {
      throw new InvalidOperationException(
        `markCacheStaleAsync() requires ${this.entityType.ctor.name} to opt into caching. Call useCaching() in onModelCreating.`,
      );
    }
    await this.coordinator.markStaleAsync(this.entityType);
  }

  private toQuery(): Query<T> {
    const executor = new QueryExecutor<T>(this.provider, this.tracker, (name) =>
      this.#modelFn().findSpecialExpand(name),
    );
    return Query.empty<T>(this.entityType, executor);
  }

  where(predicate: (b: FilterBuilder<T>) => FilterNode): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().where(predicate);
  }

  orderBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction: "asc" | "desc" = "asc",
  ): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().orderBy(selector, direction);
  }

  thenBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction: "asc" | "desc" = "asc",
  ): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().thenBy(selector, direction);
  }

  take(n: number): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().take(n);
  }

  skip(n: number): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().skip(n);
  }

  asNoTracking(): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().asNoTracking();
  }

  include<TProp>(
    selector: (e: T) => TProp,
  ): IncludableQuery<T, NavTarget<TProp>> {
    this.assertNotDisposed?.();
    return this.toQuery().include(selector);
  }

  expand(selector: (e: T) => unknown, fields?: readonly string[]): Query<T> {
    this.assertNotDisposed?.();
    return this.toQuery().expand(selector, fields);
  }

  async firstOrDefaultAsync(): Promise<T | null> {
    this.assertNotDisposed?.();
    return this.toQuery().firstOrDefaultAsync();
  }

  async singleOrDefaultAsync(): Promise<T | null> {
    this.assertNotDisposed?.();
    return this.toQuery().singleOrDefaultAsync();
  }

  async countAsync(): Promise<number> {
    this.assertNotDisposed?.();
    return this.toQuery().countAsync();
  }

  async anyAsync(): Promise<boolean> {
    this.assertNotDisposed?.();
    return this.toQuery().anyAsync();
  }

  /**
   * A provider source is read-only through the entity API; the operations that
   * create or remove principals are identity's.
   */
  private assertWritable(op: string): void {
    const source = this.entityType.source;
    if (source.kind === "provider") {
      throw new InvalidOperationException(
        `${op}() is not supported on ${this.ctor.name}: its source is the provider's '${source.key}' collection, ` +
          `which is read-only through the entity API. Create or remove principals through @speel/identity ` +
          `(identity.users.ensure, identity.groups.create, …).`,
      );
    }
  }

  add(entity: T, opts?: IAddOptions): EntityEntry<T> {
    this.assertNotDisposed?.();
    this.assertWritable("add");
    const id = persistedId(entity);
    if (id !== undefined) {
      const existing = this.tracker.findEntry(this.ctor, id);
      if (existing && existing.state === EntityState.Deleted) {
        existing.state = EntityState.Modified;
        return existing;
      }
      throw new InvalidOperationException(
        `add() requires Id to be unset on entity ${this.ctor.name}. Use update() instead.`,
      );
    }
    const e = entity as unknown as Record<string, unknown>;
    for (const p of this.entityType.properties) {
      if (p.readOnly && e[p.propertyName] !== undefined) {
        throw new InvalidOperationException(
          `add() rejected on ${this.ctor.name}: read-only property '${p.propertyName}' has a value.`,
        );
      }
    }
    const targetFolder =
      opts?.folder !== undefined ? normalizeFolderPath(opts.folder) : "";
    const targetFile =
      opts?.file !== undefined ? resolveStagedFile(opts.file) : undefined;
    // A placement option needs a store with folders and files; refused here, at
    // the call, rather than at save time inside a batch.
    if (targetFolder !== "" || targetFile !== undefined) {
      requireFileSystem(
        this.provider,
        targetFile !== undefined ? "add({ file })" : "add({ folder })",
      );
    }
    // Idempotent for an already-tracked Added instance: re-adding RE-STAGES the
    // placement options (replace-or-clear) instead of double-tracking — so a
    // retried create submit always carries the caller's CURRENT options.
    const existing = this.tracker.entryFor(entity);
    if (existing && existing.state === EntityState.Added) {
      existing.targetFolder = targetFolder !== "" ? targetFolder : undefined;
      existing.targetFile = targetFile;
      return existing;
    }
    const entry = this.tracker.track(entity, EntityState.Added);
    if (targetFolder !== "") entry.targetFolder = targetFolder;
    if (targetFile !== undefined) entry.targetFile = targetFile;
    return entry;
  }

  attach(entity: T): EntityEntry<T> {
    this.assertNotDisposed?.();
    const id = persistedId(entity);
    if (id !== undefined) {
      const existing = this.tracker.findEntry(this.ctor, id);
      if (existing) {
        throw new InvalidOperationException(
          `attach() failed: entity ${this.ctor.name} with Id=${id} is already tracked.`,
        );
      }
    }
    const snap = Snapshot.take(entity, this.entityType);
    return this.tracker.track(entity, EntityState.Unchanged, snap);
  }

  update(entity: T): EntityEntry<T> {
    this.assertNotDisposed?.();
    const id = persistedId(entity);
    const existing =
      id !== undefined ? this.tracker.findEntry(this.ctor, id) : undefined;
    let entry: EntityEntry<T>;
    if (existing) {
      entry = existing as EntityEntry<T>;
    } else {
      // Attach with an empty snapshot — so every configured non-key property is "dirty".
      entry = this.tracker.track(
        entity,
        EntityState.Unchanged,
        Snapshot.take(new this.ctor(), this.entityType),
      );
    }
    entry.state = EntityState.Modified;
    return entry;
  }

  /**
   * Mark `entity` for deletion. By default the item is recycled (soft-deleted);
   * pass `{ permanent: true }` to have it destroyed instead — `permanentDelete`
   * rides the entry to the provider at save time.
   *
   * Removing an Added entity only untracks it: nothing was ever persisted, so
   * there is nothing to recycle or destroy and `permanent` has no server-side
   * effect. The flag is still assigned before the early return so the entry the
   * caller gets back reports the mode it asked for.
   */
  remove(entity: T, options?: { permanent?: boolean }): EntityEntry<T> {
    this.assertNotDisposed?.();
    this.assertWritable("remove");
    const permanent = options?.permanent === true;
    const id = persistedId(entity);
    // The id-less path must treat a Detached entry as absent, matching findAsync/
    // toArrayAsync/QueryExecutor. entry() creates Detached bookkeeping entries for
    // untracked entities (useEntityForm does this for every form, add-mode included),
    // and without this filter one of those would be marked Deleted here instead of
    // raising the "not tracked and no Id" error — deferring the failure to a
    // DbUpdateException carrying id: undefined at the provider.
    const byInstance =
      id === undefined ? this.tracker.entryFor(entity) : undefined;
    const existing =
      id !== undefined
        ? this.tracker.findEntry(this.ctor, id)
        : byInstance && byInstance.state !== EntityState.Detached
          ? byInstance
          : undefined;
    if (existing) {
      existing.permanentDelete = permanent;
      if (existing.state === EntityState.Added) {
        this.tracker.untrack(existing);
        return existing as EntityEntry<T>;
      }
      existing.state = EntityState.Deleted;
      return existing as EntityEntry<T>;
    }
    if (id === undefined) {
      throw new InvalidOperationException(
        `remove() requires the entity to be tracked or to have an Id (entity ${this.ctor.name}).`,
      );
    }
    const snap = Snapshot.take(entity, this.entityType);
    const entry = this.tracker.track(entity, EntityState.Unchanged, snap);
    entry.permanentDelete = permanent;
    entry.state = EntityState.Deleted;
    return entry;
  }

  /**
   * Rename a document's file, leaving it in the folder it is already in. The
   * item id, version history, and permissions survive; the URL does not, so
   * `FileLeafRef`/`FileRef` are refreshed on `entity` in place.
   *
   * Unlike `add`/`update`/`remove` this is NOT staged: it goes to SharePoint
   * immediately and does not wait for `saveChangesAsync()`. Pending scalar edits
   * on the entity are untouched and still need a save.
   *
   * Renaming to a name already used in that folder fails — including the file's
   * own current name, since SharePoint sees a move onto an existing path.
   */
  async renameFileAsync(entity: T, newLeafName: string): Promise<void> {
    this.assertNotDisposed?.();
    if (!(this.ctor.prototype instanceof SpeelDocument)) {
      throw new InvalidOperationException(
        `renameFileAsync() requires a document-library entity: ${this.ctor.name} does not extend SpeelDocument.`,
      );
    }
    const leaf = normalizeLeafName(newLeafName, "renameFileAsync");
    const id = persistedId(entity);
    if (id === undefined) {
      throw new InvalidOperationException(
        `renameFileAsync() requires a saved entity: ${this.ctor.name} has no Id.`,
      );
    }

    const fs = requireFileSystem(this.provider, "renameFileAsync()");
    const result = await fs.renameFileAsync(this.entityType.list, id, leaf);

    // Reflect the server's file facts onto the model-mapped properties, the same
    // way SaveExecutor does after an upload.
    const patch = fileFactsPatch(
      this.entityType,
      result.name,
      result.serverRelativeUrl,
    );
    Object.assign(entity as unknown as Record<string, unknown>, patch);
    // Move the snapshot's originals for exactly those properties, so the rename
    // is not mistaken for a pending edit. A whole-snapshot refresh would be
    // wrong here: the entity may already carry unsaved changes, and refreshing
    // would adopt them as the original state.
    this.tracker.findEntry(this.ctor, id)?.reviseOriginals(patch);
  }

  /**
   * Copy this entity's file into another document library, leaving the source
   * untouched. IMMEDIATE, like renameFileAsync: the copy happens now, not at
   * saveChangesAsync(), and the new item is NOT loaded or tracked — read it
   * through `dest` afterwards to give it metadata.
   */
  async copyFileToAsync<D extends IEntity>(
    entity: T,
    dest: DbSet<D>,
    destFolderPath: string,
    newLeafName: string,
  ): Promise<IRenameResult> {
    this.assertNotDisposed?.();
    if (
      !(this.ctor.prototype instanceof SpeelDocument) ||
      !(dest.ctor.prototype instanceof SpeelDocument)
    ) {
      throw new InvalidOperationException(
        `copyFileToAsync() requires document-library entities on both sides: ${this.ctor.name} and ${dest.ctor.name} must extend SpeelDocument.`,
      );
    }
    const id = persistedId(entity);
    if (id === undefined) {
      throw new InvalidOperationException(
        `copyFileToAsync() requires a saved entity: ${this.ctor.name} has no Id.`,
      );
    }

    const fs = requireFileSystem(this.provider, "copyFileToAsync()");
    return fs.copyFileAsync(
      this.entityType.list,
      id,
      dest.entityType.list,
      normalizeFolderPath(destFolderPath),
      newLeafName,
    );
  }

  /**
   * Rename a folder of this list, leaving it under its current parent.
   * `folderPath` is list-relative, the same shape `add(entity, { folder })`
   * takes. Works on any list — plain lists have folders too, not just libraries.
   *
   * Like `renameFileAsync` this applies immediately rather than at save time.
   * Everything inside the folder moves with it, which no in-memory entity can
   * be told about: entities already loaded from under `folderPath` keep their
   * old `FileRef`/`FileDirRef` until they are re-read.
   */
  async renameFolderAsync(folderPath: string, newName: string): Promise<void> {
    this.assertNotDisposed?.();
    const path = normalizeFolderPath(folderPath);
    if (path === "") {
      throw new InvalidOperationException(
        `renameFolderAsync() requires a folder path: '${folderPath}' resolves to the list root, which cannot be renamed.`,
      );
    }
    const name = normalizeLeafName(newName, "renameFolderAsync");
    const fs = requireFileSystem(this.provider, "renameFolderAsync()");
    await fs.renameFolderAsync(this.entityType.list, path, name);
  }

  /**
   * Create a folder on this list, including any missing parent levels.
   * `folderPath` is list-relative, the same shape `add(entity, { folder })`
   * takes — and the same normalization, so a path is accepted with or without
   * surrounding slashes. Works on any list; plain lists have folders too.
   *
   * Idempotent by design: a folder that already exists is success, not a
   * collision, and its contents are left alone. That is what makes this safe to
   * call ahead of a batch of uploads without a prior existence check.
   *
   * Like the rename methods this applies immediately rather than at save time.
   * `add(entity, { folder })` remains the way to create a folder as part of a
   * save; reach for this when the folder has to exist on its own — before any
   * item lives in it, or when it never will.
   *
   * Returns the folder's server-relative URL. The provider resolves it against the
   * list's own root folder while creating the path, so taking it here costs nothing
   * and spares callers composing one from a web URL and a list title — which is a
   * guess, since a list's URL comes from its internal name at creation.
   */
  async ensureFolderAsync(folderPath: string): Promise<string> {
    this.assertNotDisposed?.();
    const path = normalizeFolderPath(folderPath);
    if (path === "") {
      throw new InvalidOperationException(
        `ensureFolderAsync() requires a folder path: '${folderPath}' resolves to the list root, which always exists.`,
      );
    }
    const fs = requireFileSystem(this.provider, "ensureFolderAsync()");
    const urls = await fs.ensureFoldersAsync(this.entityType.list, [path]);
    const url = urls.get(path);
    if (url === undefined) {
      throw new InvalidOperationException(
        `ensureFolderAsync('${folderPath}'): the provider created the folder but returned no URL for it.`,
      );
    }
    return url;
  }

  /**
   * Delete a folder of this list, recycling it the way `remove()` recycles an
   * item. `folderPath` is list-relative, as `ensureFolderAsync` takes it.
   *
   * **The folder's contents go with it.** SharePoint recycles a folder as one
   * subtree — there is no emptiness check to lean on — so every item under
   * `folderPath` is recycled too, and entities already loaded from under it are
   * stale in memory. Check the folder yourself first if "delete only if empty"
   * is what you meant.
   *
   * Applies immediately rather than at save time. A folder that is not there
   * fails rather than passing quietly.
   */
  async deleteFolderAsync(folderPath: string): Promise<void> {
    this.assertNotDisposed?.();
    const path = normalizeFolderPath(folderPath);
    if (path === "") {
      throw new InvalidOperationException(
        `deleteFolderAsync() requires a folder path: '${folderPath}' resolves to the list root, which cannot be deleted.`,
      );
    }
    const fs = requireFileSystem(this.provider, "deleteFolderAsync()");
    await fs.deleteFolderAsync(this.entityType.list, path);
  }

  /**
   * Check a checked-out document back in, with an optional check-in comment.
   * A **minor** check-in: a draft can be published later, an unwanted publish
   * cannot be recalled. Libraries without minor versions version it their way.
   *
   * `CheckedOutById`/`CheckedOutBy` are cleared on `entity` in place, so a
   * loaded document reads as checked in without a re-read. Pending scalar edits
   * are untouched and still need their own `saveChangesAsync()`.
   *
   * A file that is not checked out fails on the **server**, not here. There is
   * no client-side pre-check because there is nothing reliable to check:
   * materialization maps an empty value to `undefined`, so a document that was
   * loaded and is checked in looks exactly like one whose checkout state was
   * never selected. Guessing from that would refuse legitimate check-ins.
   *
   * Like the rename methods this applies immediately rather than at save time.
   */
  async checkinFileAsync(entity: T, comment?: string): Promise<void> {
    this.assertNotDisposed?.();
    if (!(this.ctor.prototype instanceof SpeelDocument)) {
      throw new InvalidOperationException(
        `checkinFileAsync() requires a document-library entity: ${this.ctor.name} does not extend SpeelDocument.`,
      );
    }
    const id = persistedId(entity);
    if (id === undefined) {
      throw new InvalidOperationException(
        `checkinFileAsync() requires a saved entity: ${this.ctor.name} has no Id.`,
      );
    }
    const fs = requireFileSystem(this.provider, "checkinFileAsync()");
    await fs.checkinFileAsync(this.entityType.list, id, comment ?? "");

    // Reflect the server's new state: the checkout is released. Cleared to
    // `undefined`, not null, so the entity reads exactly as a re-read would
    // produce it — materialization maps SharePoint's empty value that way.
    // Both the FK and the nav go, since either may have been loaded.
    const e = entity as unknown as Record<string, unknown>;
    const checkoutProp = this.entityType.findByColumnName(CHECKOUT_USER_COLUMN);
    const patch: Record<string, unknown> = checkoutProp
      ? { [checkoutProp.propertyName]: undefined }
      : {};
    Object.assign(e, patch);
    // Same reasoning as renameFileAsync: move the originals for exactly these
    // properties, never the whole snapshot, or pending edits become "original".
    const entry = this.tracker.findEntry(this.ctor, id);
    entry?.reviseOriginals(patch);
    for (const nav of this.entityType.navigations()) {
      if (nav.foreignKey.columnName !== CHECKOUT_USER_COLUMN) continue;
      e[nav.name] = undefined;
      entry?.markNavLoaded(nav.name);
    }
  }
}
