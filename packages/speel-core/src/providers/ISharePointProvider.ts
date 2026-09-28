// src/providers/ISharePointProvider.ts
import type { IListHandle } from "../types.js";
import type { FilterNode } from "../Query/FilterNode.js";
import type { Property } from "../Metadata/Property.js";

export type { IListHandle, FilterNode };

/**
 * A source the provider owns outright. Core knows only that it is not a list —
 * it cannot be provisioned, and nothing is inserted into it through the entity
 * API. What `key` names is the provider's business; @speel/pnpjs serves
 * `principals` (the User Information List), `siteUsers` and `siteGroups`.
 *
 * Every provider-source read obeys four rules, pinned by the conformance suite
 * in `@speel/core/testing`:
 *  1. A key the implementation does not serve throws, naming the key.
 *  2. Records come back in the CALLER's column vocabulary; the implementation
 *     absorbs whatever the backing endpoint calls things.
 *  3. A selected column the key cannot carry is omitted from the record. The
 *     same column in a filter throws QueryTranslationException; in an order key
 *     it throws. A read never silently drops a predicate.
 *  4. Reads only: `insert` addresses an IListHandle, never a provider source.
 */
export interface IProviderSource {
  kind: "provider";
  key: string;
}

/** Where a read comes from: a list, or a provider-owned source. */
export type ISourceHandle = IListHandle | IProviderSource;

/**
 * One field of a typed write: the model's own Property and the TYPED value —
 * `Date`, boolean, number, string, or arrays of those — after the user's
 * `toProvider` has run. The provider reads `property.columnName` and
 * `property.config` (kind, multi, and a lookup's target source) and owns every
 * wire encoding; it never consults `property.codec`. `null` appears only on
 * update, meaning clear; an insert omits unset fields.
 */
export interface IWriteField {
  property: Property;
  value: unknown;
}

/** Upload progress for a file-content add. Fired per chunk; once, on completion, for single-shot uploads. */
export interface IFileUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
}

/**
 * One file-content upload (document-library add). Structural — no PnPjs types,
 * per the containment boundary. `content`: a browser File is a Blob at this layer.
 */
export interface IFileUploadRequest {
  fileName: string;
  content: Blob | ArrayBuffer | string;
  overwrite: boolean;
  /**
   * Metadata for the item the upload implicitly creates, as typed fields; the
   * provider owns the encoding, as on `insert`. Absent → no metadata is applied.
   */
  fields?: readonly IWriteField[];
  onProgress?: ((p: IFileUploadProgress) => void) | undefined;
  signal?: AbortSignal | undefined;
}

export interface IFileUploadResult {
  id: number;
  /** The file name as SharePoint stored it (it may sanitize characters). */
  fileName: string;
  serverRelativeUrl: string;
}

/** Where a renamed file or folder ended up: its new leaf name and server-relative URL. */
export interface IRenameResult {
  name: string;
  serverRelativeUrl: string;
}

/**
 * One write in a batch. Core builds these as plain data — typed fields, never a
 * wire shape — and the provider owns every request decision and every encoding.
 */
export type IBatchOperation =
  | {
      /**
       * Typed add. The implementation picks the API (the list root and a folder
       * take different ones in SharePoint) and owns every encoding.
       */
      kind: "insert";
      list: IListHandle;
      fields: readonly IWriteField[];
      /** null → the list root. */
      folderServerRelativeUrl: string | null;
      clientToken: string;
    }
  | {
      /** Typed update. `null` on a field clears the column; an empty array clears a multi-value one. */
      kind: "update";
      list: IListHandle;
      id: number;
      fields: readonly IWriteField[];
      etag: string;
      clientToken: string;
    }
  | {
      kind: "delete";
      list: IListHandle;
      id: number;
      etag: string;
      /** When false (the default from remove()), the item is recycled instead of destroyed. */
      permanent: boolean;
      clientToken: string;
    };

export type IBatchOperationResult =
  | { kind: "success"; clientToken: string; serverData?: { id: number } }
  | { kind: "failure"; clientToken: string; status: number; body: unknown };

/**
 * One read in a batched level fetch. Core builds these as plain data; the provider
 * owns every request decision. Mirrors the write-side IBatchOperation union.
 */
export type IReadOperation =
  | {
      kind: "items";
      source: ISourceHandle;
      fields: readonly string[];
      /** Per-request page size ($top) — NOT a cap on how much comes back. */
      pageSize: number;
      options?: IGetItemsOptions;
      clientToken: string;
    }
  | {
      kind: "itemsByIds";
      source: ISourceHandle;
      ids: readonly number[];
      fields: readonly string[];
      expand?: readonly IExpandClause[];
      /** See IGetItemsOptions.properties. */
      properties?: readonly Property[];
      clientToken: string;
    };

export interface IReadOperationResult {
  clientToken: string;
  /** Every matching record. Missing ids are omitted rather than nulled. */
  items: readonly Record<string, unknown>[];
}

export interface IOrderKey {
  column: string;
  direction: "asc" | "desc";
}

export interface IExpandClause {
  navColumn: string; // top-level nav, e.g., 'Author' (or a special expand's name)
  selectFields: readonly string[]; // child fields → `${navColumn}/${field}` (may be empty)
  expandPaths?: readonly string[]; // extra nested $expand segments
  selectPaths?: readonly string[]; // extra full $select paths
  /** The target entity's properties, so expanded sub-records are typed too. */
  properties?: readonly Property[];
  /**
   * The target entity's source. A provider-routed target (a person column) tells the
   * provider to project only what its inline expand can answer, in the caller's
   * spelling; absent, or a list, the clause is taken literally.
   */
  source?: ISourceHandle;
}

export interface IGetItemsOptions {
  filter?: FilterNode;
  orderBy?: readonly IOrderKey[];
  skip?: number;
  expand?: readonly IExpandClause[]; // NEW
  /**
   * Include container rows (e.g. SharePoint folders) interleaved with item
   * rows. Default false → items only. Backends without container rows ignore
   * this (their items-only default is vacuously satisfied).
   */
  includeContainers?: boolean;
  /**
   * Properties describing columns the provider must TYPE before returning; a
   * column with no property comes back as-is.
   */
  properties?: readonly Property[];
}

/**
 * What every store must do: source-keyed reads, a count, and the typed write
 * batch. Universal filter-translation rule: an implementation must either
 * translate every FilterNode kind it receives or reject it loudly with an error
 * naming the unsupported feature — never silently drop a predicate.
 * (`include-containers` never reaches providers; the executor hoists it to
 * IGetItemsOptions.includeContainers, which a store without containers ignores.)
 * A record handed to core belongs to core: the implementation must not retain a
 * reference it later mutates or hands to another caller.
 */
export interface IStorageProvider {
  getItemByIdAsync(
    source: ISourceHandle,
    id: number,
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<Record<string, unknown> | null>;

  /**
   * Batched point lookups by Id. Returns results aligned to `ids`
   * (same length, same order); missing/404 → null at that index.
   * Implementations chunk at 100 ids per HTTP $batch.
   */
  getItemsByIdsAsync(
    source: ISourceHandle,
    ids: readonly number[],
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<readonly (Record<string, unknown> | null)[]>;

  getItemsPagedAsync(
    source: ISourceHandle,
    fields: readonly string[],
    pageSize: number,
    cursor?: string,
    options?: IGetItemsOptions,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }>;

  countAsync(
    source: ISourceHandle,
    options?: { filter?: FilterNode; includeContainers?: boolean },
  ): Promise<number>;

  /**
   * Optional capability: how many values may go into ONE `in` filter node before
   * the emitted request is too long for the backend, for a read that selects
   * `fields` and whose widest value is `maxValue`. Callers that build an `in`
   * from an unbounded id set (the inverse-FK include) chunk by this.
   *
   * Only the implementation knows its own query syntax, URL shape, and length
   * limit, so only it can answer honestly — core would be guessing, and a guess
   * that under-reserves fails at runtime. Absent, callers fall back to a
   * conservative constant. Implementations must return at least 1: a caller
   * cannot drop values, so a smaller answer would only stall its chunk loop.
   */
  maxInFilterValues?(
    column: string,
    fields: readonly string[],
    maxValue: number,
  ): number;

  executeBatchAsync(
    operations: readonly IBatchOperation[],
  ): Promise<readonly IBatchOperationResult[]>;

  /**
   * Optional capability: perform several reads in as few round-trips as possible
   * (one HTTP $batch where the backend supports it). Used to resolve every
   * navigation at one include depth together.
   *
   * Results are COMPLETE — an implementation that needs continuations to drain a
   * spilled read performs them internally, because callers have no paging policy
   * to express here. Results may come back in any order; callers match on
   * `clientToken`. A failure fails the whole call; where the implementation can
   * attribute it to one operation, it sets `clientToken` on the thrown error.
   *
   * Absent, callers fall back to the individual read methods run concurrently —
   * same results, more round-trips.
   */
  executeReadBatchAsync?(
    operations: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]>;
}

/**
 * A store whose items live in folders and may be files. Optional: core narrows
 * with `hasFileSystem` and refuses folder/file operations, `add({ folder })` and
 * `add({ file })` with an InvalidOperationException naming this capability when a
 * provider lacks it. A provider without one ignores `includeContainers` and fails
 * an insert whose `folderServerRelativeUrl` is not null.
 */
export interface IFileSystem {
  /**
   * Ensure each list-relative folder path exists (creating missing levels
   * recursively, shallow-first), and resolve it to a server-relative URL.
   * Returns a map keyed by the input list-relative path.
   */
  ensureFoldersAsync(
    list: IListHandle,
    listRelativePaths: readonly string[],
  ): Promise<Map<string, string>>;

  /**
   * Upload file content into a folder (or the library root when
   * `folderServerRelativeUrl` is null), resolve the implicitly-created list
   * item, and apply `fields` as its metadata. Not batchable (chunked
   * upload, progress, abort) — called per file by SaveExecutor. Failures
   * throw; a metadata failure after a successful upload must say so (the
   * file exists, no rollback is attempted).
   */
  uploadFileAsync(
    list: IListHandle,
    folderServerRelativeUrl: string | null,
    request: IFileUploadRequest,
  ): Promise<IFileUploadResult>;

  /**
   * Rename a document-library file in place, keeping it in its current folder.
   *
   * SharePoint has no rename verb — a rename IS a move whose destination shares
   * the source's parent — so the contract is stated as the caller sees it (a new
   * leaf name) and implementations express the move. Within one library the item
   * id, version history, and permissions survive; the URL does not, so the new
   * one comes back for the caller to reflect onto FileLeafRef/FileRef.
   *
   * A name already taken in that folder must FAIL rather than overwrite —
   * including the file's own current name.
   */
  renameFileAsync(
    list: IListHandle,
    itemId: number,
    newLeafName: string,
  ): Promise<IRenameResult>;

  /**
   * Copy a document-library file into another library (or another folder of the
   * same one), leaving the source untouched.
   *
   * `destListRelativePath` is the destination folder relative to the destination
   * list root, in the normalized 'a/b' form `ensureFoldersAsync` takes ('' means
   * the library root); the folder must already exist. An occupied destination
   * must FAIL rather than overwrite. The copy is a NEW item in the destination
   * library — the source's id, history and permissions do not travel with it.
   */
  copyFileAsync(
    sourceList: IListHandle,
    itemId: number,
    destList: IListHandle,
    destListRelativePath: string,
    newLeafName: string,
  ): Promise<IRenameResult>;

  /**
   * Rename a list/library folder in place, keeping it under its current parent.
   * `listRelativePath` is the folder's current path relative to the list root
   * (normalized 'a/b' form — no leading/trailing slash), as `ensureFoldersAsync`
   * takes it.
   *
   * The folder keeps its list item and everything inside it moves with it, so
   * every URL held for a descendant (FileRef/FileDirRef, cached or in memory) is
   * stale afterwards. An occupied destination must fail rather than merge.
   */
  renameFolderAsync(
    list: IListHandle,
    listRelativePath: string,
    newName: string,
  ): Promise<IRenameResult>;

  /**
   * Delete a list/library folder. `listRelativePath` is the folder's path
   * relative to the list root, in the same normalized 'a/b' form
   * `ensureFoldersAsync` takes.
   *
   * Recycled, not destroyed — the same default `remove()` applies to items, so
   * one bad call stays recoverable from the recycle bin.
   *
   * The folder goes WITH ITS CONTENTS: SharePoint's folder recycle takes the
   * whole subtree as a single recycle-bin entry and imposes no emptiness check,
   * so implementations must not add one. Every descendant item disappears from
   * the list, and in-memory entities loaded from under the folder are stale.
   *
   * A folder that is not there must fail rather than report success — callers
   * that want idempotence can ask for it explicitly.
   */
  deleteFolderAsync(list: IListHandle, listRelativePath: string): Promise<void>;

  /**
   * Check a checked-out document back in, releasing the lock and publishing the
   * pending version. `comment` is the check-in comment; empty string means none,
   * which is what SharePoint records when a user leaves the box blank.
   *
   * A **minor** check-in: the conservative end of the verb, since a draft can
   * always be published afterwards while an unwanted publish cannot be recalled.
   * Libraries without minor versions apply their own versioning regardless.
   *
   * A file that is not checked out must fail — the server says so plainly, and
   * swallowing it would hide a lost checkout.
   */
  checkinFileAsync(
    list: IListHandle,
    itemId: number,
    comment: string,
  ): Promise<void>;
}

/** Incremental sync. Optional: the cache's delta sync is its only consumer, and `cacheAsync()` refuses without it. */
export interface IChangeFeed {
  /**
   * Incremental sync. Pass '' (empty) on first load to get the current change
   * token plus all items as `changed`. Pass a prior token to get items modified
   * since (via Modified ge) as `changed` and items removed since as `deletedIds`.
   */
  getListItemChangesSinceToken(
    list: IListHandle,
    token: string,
    fields: readonly string[],
    expand?: readonly IExpandClause[],
    properties?: readonly Property[],
  ): Promise<{
    changed: Record<string, unknown>[];
    deletedIds: number[];
    newToken: string;
  }>;
}

/** @deprecated The three interfaces above are the contract; this alias names a provider that implements all of them. */
export type ISharePointProvider = IStorageProvider & IFileSystem & IChangeFeed;
