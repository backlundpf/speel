// src/SharePointProvider.ts
//
// The PnPjs-backed provider: IStorageProvider, IFileSystem and IChangeFeed in
// one object. The reads, count and write batch live here; the IFileSystem and
// IChangeFeed members delegate to SharePointFileSystem and SharePointChangeFeed,
// which reach back through the ISharePointHost seam this class satisfies. This
// package owns @pnp/sp as a typed dependency: the selector imports below
// register the invokable behaviours at runtime and contribute the fluent-type
// augmentations (e.g. `.web.lists`, `.batched()`, `.rootFolder`) that the
// method bodies compile against.
import type { SPFI, ISPQueryable } from "@pnp/sp";
// The response row of the two validate-update APIs: every member optional, plus
// HasException/ErrorMessage. This package's IFormValue (formValues.ts) is the
// request row.
import type {
  IList,
  IListItemFormUpdateValue as ISPFormUpdateValue,
} from "@pnp/sp/lists/index.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import "@pnp/sp/batching.js";
import "@pnp/sp/folders/index.js";
import "@pnp/sp/files/index.js";
import "@pnp/sp/security/index.js";
import "@pnp/sp/site-users/index.js";
import "@pnp/sp/site-groups/index.js";
import { JSONParse } from "@pnp/queryable";
import type {
  IStorageProvider,
  IFileSystem,
  IChangeFeed,
  IBatchOperation,
  IBatchOperationResult,
  IGetItemsOptions,
  IExpandClause,
  IListHandle,
  IOrderKey,
  IProviderSource,
  FilterNode,
  IFileUploadRequest,
  IFileUploadResult,
  IReadOperation,
  IReadOperationResult,
  IRenameResult,
  ISourceHandle,
  IWriteField,
  Property,
} from "@speel/core";
import { containsContainerScope } from "@speel/core";
import {
  toJsonPayload,
  toFormValues,
  collectPrincipalIds,
  firstUnresolvedPrincipal,
  type IFormValue,
} from "./formValues.js";
import { toODataString } from "./toODataString.js";
import { maxInFilterValues as inFilterBudget } from "./queryStringBudget.js";
import { coerceRecord, coerceRecords } from "./readValues.js";
import {
  principalSourceKey,
  selectFor,
  translateFilter,
  translateOrderBy,
  inboundRecord,
  personExpandColumn,
  type PrincipalSourceKey,
} from "./principalSources.js";
import { SharePointFileSystem } from "./SharePointFileSystem.js";
import { SharePointChangeFeed } from "./SharePointChangeFeed.js";
// Re-exported so the upload tests keep importing the threshold from this module.
export { SINGLE_SHOT_MAX_BYTES } from "./SharePointFileSystem.js";

// PnPjs v4 exposes paging via Symbol.asyncIterator on items collections.
// Each `next()` call fetches one page over the wire, except the final call
// (after the previous page reported no nextLink), which short-circuits to
// `{ done: true }` without HTTP.
type ItemPageIter = AsyncIterator<Record<string, unknown>[]>;

/**
 * The slice of a PnPjs collection queryable every principal endpoint shares. The
 * UIL's `items` also iterates (it is a list); the two `web/` collections do not.
 */
interface IPrincipalCollection {
  select(...fields: string[]): IPrincipalCollection;
  filter(f: string): IPrincipalCollection;
  top(n: number): IPrincipalCollection;
  skip(n: number): IPrincipalCollection;
  orderBy(column: string, ascending?: boolean): IPrincipalCollection;
  using(behavior: unknown): IPrincipalCollection;
  getById(id: number): ISPQueryable;
  (): Promise<Record<string, unknown>[]>;
  [Symbol.asyncIterator]?(): ItemPageIter;
}

/**
 * SharePoint caps an OData $batch at 100 sub-requests; a wider level splits
 * across batches. This has to be passed to `sp.batched()` as well as used to
 * chunk our own queue — PnPjs defaults `maxRequests` to 20 and issues one
 * sequential POST per chunk, so omitting it turns a 100-op batch into 5 requests.
 */
const BATCH_REQUEST_LIMIT = 100;

/** One queued sub-request of a read batch, plus whether it saw the whole result set. */
interface IQueuedRead {
  clientToken: string;
  /**
   * Register the request against the batch scope. MUST invoke the queryable
   * synchronously — PnPjs enrolls a request in the batch at invoke time, so a
   * caller that awaits anything first would miss `execute()`.
   */
  send(
    sp2: SPFI,
  ): Promise<{ items: Record<string, unknown>[]; complete: boolean }>;
}

/**
 * Read a raw OData collection envelope, as `JSONParse()` hands it over — PnPjs's
 * DefaultParse unwraps to the bare row array and throws the continuation link away,
 * which a batched read cannot afford: without it there is no way to know the result
 * is whole, and the contract promises completeness.
 *
 * Deliberately conservative. `complete: false` means "re-fetch this one outside the
 * batch", never "there is no more data", so every shape we fail to recognize — and
 * every full page whose continuation link sits under a key we did not anticipate —
 * degrades to a correct extra round-trip instead of silent truncation.
 */
function readCollectionEnvelope(
  raw: unknown,
  pageSize: number,
): { items: Record<string, unknown>[]; complete: boolean } {
  const body = raw as
    | {
        value?: unknown;
        d?: { results?: unknown; __next?: unknown };
        "odata.nextLink"?: unknown;
        "@odata.nextLink"?: unknown;
      }
    | null
    | undefined;

  const rows = Array.isArray(body?.value)
    ? body.value
    : Array.isArray(body?.d?.results)
      ? body.d.results
      : undefined;
  if (!Array.isArray(rows)) return { items: [], complete: false };

  const next =
    body?.["odata.nextLink"] ?? body?.["@odata.nextLink"] ?? body?.d?.__next;
  const items = rows as Record<string, unknown>[];
  if (next !== undefined && next !== null) return { items, complete: false };
  // A short page cannot have a successor. A full one might, so only trust it when we
  // positively read a continuation link — see the note above.
  return { items, complete: items.length < pageSize };
}

/** Tag an error with the operation it came from, without overwriting an existing tag. */
function attributeReadError(err: unknown, clientToken: string): unknown {
  if (err !== null && typeof err === "object" && !("clientToken" in err)) {
    (err as { clientToken?: string }).clientToken = clientToken;
  }
  return err;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 404
  );
}

export class SharePointProvider
  implements IStorageProvider, IFileSystem, IChangeFeed
{
  private readonly pagedIterators = new Map<string, ItemPageIter>();

  // list key -> the in-flight or settled root-URL read. See resolveListRootUrl.
  private readonly rootUrlCache = new Map<string, Promise<string>>();

  // The IFileSystem and IChangeFeed halves. Each takes `this` as its
  // ISharePointHost and reads the SPFI lazily, so constructing them here, before
  // the constructor body assigns `sp`, is safe.
  private readonly files = new SharePointFileSystem(this);
  private readonly changes = new SharePointChangeFeed(this);

  /** `sp` is public for `getSPFI()` only. @internal */
  constructor(public readonly sp: SPFI) {}

  private listOn(sp: SPFI, handle: IListHandle): IList {
    switch (handle.kind) {
      case "title":
        return sp.web.lists.getByTitle(handle.value);
      case "id":
        return sp.web.lists.getById(handle.value);
    }
  }

  /** @internal */
  list(handle: IListHandle): IList {
    return this.listOn(this.sp, handle);
  }

  // Principal id → login name, for every principal a provider-source read of this
  // instance has returned with its LoginName. A person column written through the
  // form-values API takes claims Keys, and this is where they come from: a save that
  // follows a query resolves nothing. A login does not change under a site, so the
  // entry is never evicted — the "immutable once seen" policy.
  private readonly loginById = new Map<number, string>();

  private harvest(records: readonly (Record<string, unknown> | null)[]): void {
    for (const r of records) {
      if (
        r &&
        typeof r.Id === "number" &&
        typeof r.LoginName === "string" &&
        r.LoginName
      ) {
        this.loginById.set(r.Id, r.LoginName);
      }
    }
  }

  /**
   * Login names for principal ids: the cache first, the User Information List for
   * the rest in one batched read. An id the site has never seen, or one with no
   * login, is simply absent from the map — the caller decides what that does to
   * its operation. The read harvests, so the cache fills as a side effect.
   */
  private async resolveLoginsAsync(
    ids: readonly number[],
  ): Promise<ReadonlyMap<number, string>> {
    const missing = [...new Set(ids)].filter((id) => !this.loginById.has(id));
    if (missing.length > 0) {
      await this.principalsByIdsAsync(
        { kind: "provider", key: "principals" },
        missing,
        ["Id", "LoginName"],
      );
    }
    const out = new Map<number, string>();
    for (const id of ids) {
      const login = this.loginById.get(id);
      if (login) out.set(id, login);
    }
    return out;
  }

  /** The `loginOf` for `toFormValues`, with every principal `fields` names resolved up front. @internal */
  async loginsFor(
    fields: readonly IWriteField[],
  ): Promise<(id: number) => string | undefined> {
    const logins = await this.resolveLoginsAsync(collectPrincipalIds(fields));
    return (id) => logins.get(id);
  }

  private principalCollection(
    sp: SPFI,
    key: PrincipalSourceKey,
  ): IPrincipalCollection {
    switch (key) {
      case "principals":
        return sp.web.siteUserInfoList.items as unknown as IPrincipalCollection;
      case "siteUsers":
        return sp.web.siteUsers as unknown as IPrincipalCollection;
      case "siteGroups":
        return sp.web.siteGroups as unknown as IPrincipalCollection;
    }
  }

  /**
   * Everything a provider-source query needs, settled before any request: the key,
   * $select, translated filter and order — and `finish`, which shapes each row into
   * the caller's spelling (`inboundRecord`) and then types the columns the caller's
   * properties describe. The rename goes first: a property names the caller's column.
   */
  private principalQuery(
    source: IProviderSource,
    fields: readonly string[],
    options:
      | {
          filter?: FilterNode | undefined;
          orderBy?: readonly IOrderKey[] | undefined;
          expand?: readonly IExpandClause[] | undefined;
          properties?: readonly Property[] | undefined;
        }
      | undefined,
  ): {
    key: PrincipalSourceKey;
    selects: string[];
    odata: string | undefined;
    order: IOrderKey[];
    finish: (rows: Record<string, unknown>[]) => Record<string, unknown>[];
  } {
    const key = principalSourceKey(source);
    if (options?.expand?.length) {
      throw new Error(
        `Provider source '${key}' cannot be expanded; it has no navigations.`,
      );
    }
    const odata = options?.filter
      ? toODataString(translateFilter(key, options.filter))
      : undefined;
    return {
      key,
      selects: selectFor(key, fields),
      odata,
      order: translateOrderBy(key, options?.orderBy ?? []),
      finish: (rows) => {
        const recs = coerceRecords(
          rows.map((r) => inboundRecord(key, r, fields)),
          options?.properties,
        );
        this.harvest(recs);
        return recs;
      },
    };
  }

  // Assemble the $select and $expand for an item read: the entity's own columns,
  // then whatever the expand clauses contribute.
  //
  // SharePoint will not project a path-shaped $select unless the owning navigation
  // is also expanded — `$select=File/Length` is legal only alongside `$expand=File`.
  // A column name may itself BE such a path (SpeelDocument.FileSize maps to
  // File/Length, because the 'File Size' list column is computed and unselectable),
  // so derive the expand from the select rather than making every caller thread it
  // through. Columns without a '/' are unaffected — a plain list never gains an expand.
  /** @internal */
  selectAndExpand(
    fields: readonly string[],
    expand: readonly IExpandClause[] | undefined,
  ): { selects: string[]; expands: string[] } {
    const selects: string[] = [...fields];
    const expands: string[] = [];
    for (const e of expand ?? []) {
      expands.push(e.navColumn);
      // A provider-routed target is a person column: the inline expand answers
      // from the UIL in its own spelling and projects four columns, so the
      // clause's fields are mapped onto those and the rest dropped.
      const person = e.source?.kind === "provider";
      for (const f of e.selectFields) {
        const column = person ? personExpandColumn(f) : f;
        if (column === undefined) continue;
        const path = `${e.navColumn}/${column}`;
        if (!selects.includes(path)) selects.push(path);
      }
      if (e.expandPaths) expands.push(...e.expandPaths);
      if (e.selectPaths) selects.push(...e.selectPaths);
    }
    for (const f of fields) {
      const slash = f.indexOf("/");
      if (slash <= 0) continue;
      const nav = f.slice(0, slash);
      if (!expands.includes(nav)) expands.push(nav);
    }
    return { selects, expands };
  }

  async getItemByIdAsync(
    source: ISourceHandle,
    id: number,
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<Record<string, unknown> | null> {
    if (source.kind === "provider") {
      const [r] = await this.getItemsByIdsAsync(source, [id], fields, opts);
      return r ?? null;
    }
    const list = source;
    try {
      const { selects, expands } = this.selectAndExpand(fields, opts?.expand);
      let q = this.list(list)
        .items.getById(id)
        .select(...selects);
      if (expands.length) q = q.expand(...expands);
      const item = await q();
      return coerceRecord(
        item as Record<string, unknown>,
        opts?.properties,
        opts?.expand,
      );
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        (err as { status: number }).status === 404
      ) {
        return null;
      }
      throw err;
    }
  }

  async getItemsByIdsAsync(
    source: ISourceHandle,
    ids: readonly number[],
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<readonly (Record<string, unknown> | null)[]> {
    if (source.kind === "provider")
      return this.principalsByIdsAsync(source, ids, fields, opts);
    const list = source;
    if (ids.length === 0) return [];
    const CHUNK = 100;
    const out: (Record<string, unknown> | null)[] = [];
    const { selects, expands } = this.selectAndExpand(fields, opts?.expand);

    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const [sp2, execute] = this.sp.batched({
        maxRequests: BATCH_REQUEST_LIMIT,
      });
      const promises: Promise<Record<string, unknown> | null>[] = chunk.map(
        (id) => {
          let item = this.listOn(sp2, list)
            .items.getById(id)
            .select(...selects);
          if (expands.length) item = item.expand(...expands);
          return item()
            .then((r: Record<string, unknown>) =>
              coerceRecord(r, opts?.properties, opts?.expand),
            )
            .catch((err: unknown) => {
              if (
                typeof err === "object" &&
                err !== null &&
                "status" in err &&
                (err as { status: number }).status === 404
              ) {
                return null;
              }
              throw err;
            });
        },
      );
      await execute();
      const results = await Promise.all(promises);
      out.push(...results);
    }
    return out;
  }

  private async principalsByIdsAsync(
    source: IProviderSource,
    ids: readonly number[],
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<readonly (Record<string, unknown> | null)[]> {
    const { key, selects, finish } = this.principalQuery(source, fields, opts);
    if (ids.length === 0) return [];
    const out: (Record<string, unknown> | null)[] = [];
    for (let i = 0; i < ids.length; i += BATCH_REQUEST_LIMIT) {
      const chunk = ids.slice(i, i + BATCH_REQUEST_LIMIT);
      const [sp2, execute] = this.sp.batched({
        maxRequests: BATCH_REQUEST_LIMIT,
      });
      const promises = chunk.map((id) =>
        (
          this.principalCollection(sp2, key)
            .getById(id)
            .select(...selects) as unknown as () => Promise<
            Record<string, unknown>
          >
        )()
          .then((r) => finish([r])[0]!)
          .catch((err: unknown) => {
            if (isNotFound(err)) return null;
            throw err;
          }),
      );
      await execute();
      out.push(...(await Promise.all(promises)));
    }
    return out;
  }

  async getItemsPagedAsync(
    source: ISourceHandle,
    fields: readonly string[],
    pageSize: number,
    cursor?: string,
    options?: IGetItemsOptions,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    if (source.kind === "provider")
      return this.principalsPagedAsync(
        source,
        fields,
        pageSize,
        cursor,
        options,
      );
    const list = source;
    let iter: ItemPageIter;
    if (cursor !== undefined && this.pagedIterators.has(cursor)) {
      iter = this.pagedIterators.get(cursor)!;
      this.pagedIterators.delete(cursor);
    } else {
      const { selects, expands } = this.selectAndExpand(
        fields,
        options?.expand,
      );
      let q = this.list(list).items.select(...selects);
      if (expands.length) q = q.expand(...expands);
      const odata = await this.buildItemsFilter(
        list,
        options?.filter,
        options?.includeContainers,
      );
      if (odata) q = q.filter(odata);
      if (options?.orderBy?.length) {
        for (const key of options.orderBy) {
          q = q.orderBy(key.column, key.direction === "asc");
        }
      }
      if (options?.skip !== undefined && options.skip > 0) {
        q = q.skip(options.skip);
      }
      iter = (q.top(pageSize) as AsyncIterable<Record<string, unknown>[]>)[
        Symbol.asyncIterator
      ]();
    }

    const result = await iter.next();
    if (result.done) {
      return { items: [], nextCursor: null };
    }
    // Keep the iterator alive under a new cursor. A subsequent call drains it;
    // when the iterator's internal nextLink is exhausted, that call returns
    // `done: true` without HTTP and we report nextCursor=null then.
    const nextCursor = `c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    this.pagedIterators.set(nextCursor, iter);
    // Typed per page with THIS call's options: a resumed page is described by the
    // properties its caller passes, not by whatever opened the iterator.
    return {
      items: coerceRecords(result.value, options?.properties, options?.expand),
      nextCursor,
    };
  }

  private async principalsPagedAsync(
    source: IProviderSource,
    fields: readonly string[],
    pageSize: number,
    cursor: string | undefined,
    options: IGetItemsOptions | undefined,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    const { key, selects, odata, order, finish } = this.principalQuery(
      source,
      fields,
      options,
    );
    if (key === "principals") {
      // The User Information List IS a list: page it exactly like one, through the
      // items iterator and a continuation cursor. No FSObjType clause — it has no folders.
      let iter: ItemPageIter;
      if (cursor !== undefined && this.pagedIterators.has(cursor)) {
        iter = this.pagedIterators.get(cursor)!;
        this.pagedIterators.delete(cursor);
      } else {
        let q = this.principalCollection(this.sp, key).select(...selects);
        if (odata) q = q.filter(odata);
        for (const k of order) q = q.orderBy(k.column, k.direction === "asc");
        if (options?.skip !== undefined && options.skip > 0)
          q = q.skip(options.skip);
        iter = q.top(pageSize)[Symbol.asyncIterator]!();
      }
      const result = await iter.next();
      if (result.done) return { items: [], nextCursor: null };
      const nextCursor = `c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      this.pagedIterators.set(nextCursor, iter);
      return { items: finish(result.value), nextCursor };
    }
    // web/siteusers and web/sitegroups carry no continuation link: page by offset,
    // the cursor being the next offset. A full page MAY have a successor; the extra
    // empty page that costs on an exact multiple is the price of not guessing.
    const offset =
      cursor !== undefined ? parseInt(cursor, 10) : (options?.skip ?? 0);
    // A cursor from another read (a list's or the UIL's `c-…`) parses to NaN, and NaN
    // would re-serve page 1 under a "NaN" cursor forever — an unterminated drain.
    if (cursor !== undefined && !Number.isFinite(offset)) {
      throw new Error(
        `Provider source '${key}': cursor '${cursor}' does not belong to this read.`,
      );
    }
    let q = this.principalCollection(this.sp, key)
      .select(...selects)
      .top(pageSize);
    if (offset > 0) q = q.skip(offset);
    if (odata) q = q.filter(odata);
    for (const k of order) q = q.orderBy(k.column, k.direction === "asc");
    const rows = await q();
    return {
      items: finish(rows),
      nextCursor: rows.length === pageSize ? String(offset + pageSize) : null,
    };
  }

  // SharePoint has no `in` operator — toODataString turns an `in` node into one
  // `Col eq v` clause per value — so a caller's id-set size, not the operator,
  // decides whether the URL still fits under maxQueryStringLength. Core cannot see
  // that; it asks here and chunks by the answer. Derive $select/$expand exactly as
  // the read itself will, so a document library's `File/Length` column pays for its
  // implied `$expand=File` here too.
  maxInFilterValues(
    column: string,
    fields: readonly string[],
    maxValue: number,
  ): number {
    const { selects, expands } = this.selectAndExpand(fields, undefined);
    return inFilterBudget({ column, maxValue, selects, expands });
  }

  async countAsync(
    source: ISourceHandle,
    options?: { filter?: FilterNode; includeContainers?: boolean },
  ): Promise<number> {
    if (source.kind === "provider") {
      const { key, selects, odata } = this.principalQuery(
        source,
        ["Id"],
        options?.filter ? { filter: options.filter } : undefined,
      );
      let q = this.principalCollection(this.sp, key)
        .select(...selects)
        .top(5000);
      if (odata) q = q.filter(odata);
      if (key === "principals") {
        let total = 0;
        for await (const page of q as unknown as AsyncIterable<
          Record<string, unknown>[]
        >)
          total += page.length;
        return total;
      }
      return (await q()).length;
    }
    const list = source;
    // The cheap ItemCount property includes folder rows, so it is only valid
    // when containers were explicitly requested (and there is nothing to filter).
    if (!options?.filter && options?.includeContainers) {
      const info = await this.list(list).select("ItemCount")();
      return info.ItemCount;
    }
    // PnPjs v4 doesn't expose .count() on items. Drive the async iterator with
    // a thin select (Id only) and a max page size, summing page lengths. One
    // HTTP round-trip for the common case where the result fits in one server
    // page (SharePoint caps at 5000 items per page).
    const odata = await this.buildItemsFilter(
      list,
      options?.filter,
      options?.includeContainers,
    );
    let q = this.list(list).items.select("Id").top(5000);
    if (odata) q = q.filter(odata);
    let total = 0;
    for await (const page of q as AsyncIterable<Record<string, unknown>[]>) {
      total += page.length;
    }
    return total;
  }

  /**
   * Resolve one include level in as few round-trips as the backend allows: every read
   * the level needs is queued into a single `sp.batched()` scope (or as few as the
   * 100-sub-request cap permits) and executed together.
   *
   * Results are complete, per the contract. Point lookups are inherently whole. A
   * filtered read is whole only when its first page was the last one, so any read that
   * cannot be shown to be complete is re-fetched in full on the paged-iterator path —
   * a second round-trip for that read alone, and only in the spill case.
   */
  async executeReadBatchAsync(
    operations: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]> {
    if (operations.length === 0) return [];

    const queued: IQueuedRead[] = [];
    for (const op of operations) queued.push(...(await this.prepareRead(op)));

    const itemsByToken = new Map<string, Record<string, unknown>[]>();
    for (const op of operations) itemsByToken.set(op.clientToken, []);
    const incomplete = new Set<string>();

    for (let i = 0; i < queued.length; i += BATCH_REQUEST_LIMIT) {
      const slice = queued.slice(i, i + BATCH_REQUEST_LIMIT);
      const [sp2, execute] = this.sp.batched({
        maxRequests: BATCH_REQUEST_LIMIT,
      });
      // Queue every request BEFORE execute(); awaiting here would deadlock the batch.
      const pending = slice.map((r) => ({
        clientToken: r.clientToken,
        promise: r.send(sp2),
      }));
      await execute();
      for (const p of pending) {
        let result: { items: Record<string, unknown>[]; complete: boolean };
        try {
          result = await p.promise;
        } catch (err) {
          throw attributeReadError(err, p.clientToken);
        }
        itemsByToken.get(p.clientToken)!.push(...result.items);
        if (!result.complete) incomplete.add(p.clientToken);
      }
    }

    for (const op of operations) {
      if (op.kind !== "items" || !incomplete.has(op.clientToken)) continue;
      try {
        itemsByToken.set(op.clientToken, await this.drainItems(op));
      } catch (err) {
        throw attributeReadError(err, op.clientToken);
      }
    }

    return operations.map((op) => ({
      clientToken: op.clientToken,
      items: itemsByToken.get(op.clientToken)!,
    }));
  }

  /**
   * Expand one read descriptor into the sub-requests it needs. Everything that must
   * touch the network to be decided (the OData filter string, which can resolve a list
   * root URL) is settled here, so `send` stays synchronous up to its invoke.
   */
  private async prepareRead(op: IReadOperation): Promise<IQueuedRead[]> {
    // Settle the source here, never inside `send`: a throw there would leave the
    // open batch un-executed and slip past attributeReadError.
    if (op.source.kind === "provider") {
      return this.preparePrincipalRead(
        op as typeof op & { source: IProviderSource },
      );
    }
    const list = op.source;

    if (op.kind === "itemsByIds") {
      const { selects, expands } = this.selectAndExpand(op.fields, op.expand);
      // Captured now, with the rest of the descriptor: `send` must stay a pure
      // enqueue, and the typing it applies is part of what was prepared.
      const { properties, expand } = op;
      return op.ids.map((id) => ({
        clientToken: op.clientToken,
        send: (sp2: SPFI) => {
          let item = this.listOn(sp2, list)
            .items.getById(id)
            .select(...selects);
          if (expands.length) item = item.expand(...expands);
          return item()
            .then((r: Record<string, unknown>) => ({
              items: [coerceRecord(r, properties, expand)],
              complete: true,
            }))
            .catch((err: unknown) => {
              if (isNotFound(err)) return { items: [], complete: true };
              throw err;
            });
        },
      }));
    }

    const { selects, expands } = this.selectAndExpand(
      op.fields,
      op.options?.expand,
    );
    const odata = await this.buildItemsFilter(
      list,
      op.options?.filter,
      op.options?.includeContainers,
    );
    const properties = op.options?.properties;
    const expand = op.options?.expand;
    return [
      {
        clientToken: op.clientToken,
        send: (sp2: SPFI) => {
          let q = this.listOn(sp2, list).items.select(...selects);
          if (expands.length) q = q.expand(...expands);
          if (odata) q = q.filter(odata);
          for (const key of op.options?.orderBy ?? []) {
            q = q.orderBy(key.column, key.direction === "asc");
          }
          if (op.options?.skip !== undefined && op.options.skip > 0)
            q = q.skip(op.options.skip);
          // JSONParse keeps the OData envelope, which is the only place the continuation
          // link survives; DefaultParse would hand back the rows alone.
          return (
            q
              .top(op.pageSize)
              .using(JSONParse()) as unknown as () => Promise<unknown>
          )().then((raw) => {
            const env = readCollectionEnvelope(raw, op.pageSize);
            return {
              items: coerceRecords(env.items, properties, expand),
              complete: env.complete,
            };
          });
        },
      },
    ];
  }

  private preparePrincipalRead(
    op: Extract<IReadOperation, { kind: "items" | "itemsByIds" }> & {
      source: IProviderSource;
    },
  ): IQueuedRead[] {
    if (op.kind === "itemsByIds") {
      const { key, selects, finish } = this.principalQuery(
        op.source,
        op.fields,
        { expand: op.expand, properties: op.properties },
      );
      return op.ids.map((id) => ({
        clientToken: op.clientToken,
        send: (sp2: SPFI) =>
          (
            this.principalCollection(sp2, key)
              .getById(id)
              .select(...selects) as unknown as () => Promise<
              Record<string, unknown>
            >
          )()
            .then((r) => ({ items: finish([r]), complete: true }))
            .catch((err: unknown) => {
              if (isNotFound(err)) return { items: [], complete: true };
              throw err;
            }),
      }));
    }
    const { key, selects, odata, order, finish } = this.principalQuery(
      op.source,
      op.fields,
      op.options,
    );
    return [
      {
        clientToken: op.clientToken,
        send: (sp2: SPFI) => {
          let q = this.principalCollection(sp2, key).select(...selects);
          if (odata) q = q.filter(odata);
          for (const k of order) q = q.orderBy(k.column, k.direction === "asc");
          if (op.options?.skip !== undefined && op.options.skip > 0)
            q = q.skip(op.options.skip);
          return (
            q
              .top(op.pageSize)
              .using(JSONParse()) as unknown as () => Promise<unknown>
          )().then((raw) => {
            const env = readCollectionEnvelope(raw, op.pageSize);
            return { items: finish(env.items), complete: env.complete };
          });
        },
      },
    ];
  }

  /** Full paged drain for a read the batch could not complete. */
  private async drainItems(
    op: Extract<IReadOperation, { kind: "items" }>,
  ): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.getItemsPagedAsync(
        op.source,
        op.fields,
        op.pageSize,
        cursor,
        op.options,
      );
      out.push(...page.items);
      if (!page.nextCursor) return out;
      cursor = page.nextCursor;
    }
  }

  async executeBatchAsync(
    operations: readonly IBatchOperation[],
  ): Promise<readonly IBatchOperationResult[]> {
    if (operations.length === 0) return [];

    // Every principal a typed write names — insert or update — is resolved up
    // front: one read for the whole batch, none when the cache already holds them.
    // The folder path needs the logins (a person column is written by claims Key
    // there); the JSON paths need the check: items.add takes ids and does not
    // validate them — SharePoint answers 201 to an id the site has never issued
    // and stores a dangling reference (verified live); items.update is the same
    // JSON path and is checked the same way (inferred from the add finding, not
    // separately observed) — so a write naming an unknown principal fails here,
    // whichever API it takes. PnPjs enrolls a request in the
    // batch at invoke time, so nothing async may sit between batched() and the map
    // below; this is why it happens here. A non-404 transport failure in this
    // up-front read rejects the WHOLE call with nothing sent — the same shape as a
    // failed $batch; only an id that stays unresolved (absent, or without a login)
    // is a per-operation failure below.
    const loginOf = await this.loginsFor(
      operations.flatMap((op) =>
        op.kind === "insert" || op.kind === "update" ? op.fields : [],
      ),
    );

    const [sp2, execute] = this.sp.batched({
      maxRequests: BATCH_REQUEST_LIMIT,
    });
    const opPromises: Promise<IBatchOperationResult>[] = operations.map(
      (op) => {
        const list = this.listOn(sp2, op.list);
        // Never sent: an unresolvable principal, or a person column whose target
        // names a key this provider does not serve, fails THIS operation, not the
        // batch. Both are thrown by the encoders before the queryable is invoked,
        // so catching Error at the call sites is safe — nothing has enrolled in
        // the batch yet.
        const refuse = (err: Error): Promise<IBatchOperationResult> =>
          Promise.resolve(
            this.toFailure(op.clientToken, {
              status: 400,
              message: err.message,
            }),
          );
        switch (op.kind) {
          case "insert": {
            if (op.folderServerRelativeUrl === null) {
              let payload: Record<string, unknown>;
              try {
                const unresolved = firstUnresolvedPrincipal(op.fields, loginOf);
                if (unresolved) return refuse(unresolved);
                payload = toJsonPayload(op.fields);
              } catch (err: unknown) {
                return refuse(err as Error);
              }
              return list.items
                .add(payload)
                .then(this.addResult(op.clientToken))
                .catch((err: unknown) => this.toFailure(op.clientToken, err));
            }
            let formValues: IFormValue[];
            try {
              formValues = toFormValues(op.fields, loginOf);
            } catch (err: unknown) {
              return refuse(err as Error);
            }
            return list
              .addValidateUpdateItemUsingPath(
                formValues,
                op.folderServerRelativeUrl,
              )
              .then(this.formValuesResult(op.clientToken))
              .catch((err: unknown) => this.toFailure(op.clientToken, err));
          }
          case "update": {
            // Typed fields encode as `items.update` JSON — the same path, and the
            // same checks, as a root insert: an unresolvable principal or an
            // unserved target key fails THIS operation before the queryable is
            // invoked, nothing enrolled. A `null` value is a clear and names no
            // principal.
            let payload: Record<string, unknown>;
            try {
              const unresolved = firstUnresolvedPrincipal(op.fields, loginOf);
              if (unresolved) return refuse(unresolved);
              payload = toJsonPayload(op.fields);
            } catch (err: unknown) {
              return refuse(err as Error);
            }
            return list.items
              .getById(op.id)
              .update(payload, op.etag)
              .then(() => ({
                kind: "success" as const,
                clientToken: op.clientToken,
              }))
              .catch((err: unknown) => this.toFailure(op.clientToken, err));
          }
          case "delete":
            return (
              op.permanent
                ? list.items.getById(op.id).delete(op.etag)
                : list.items.getById(op.id).recycle()
            )
              .then(() => ({
                kind: "success" as const,
                clientToken: op.clientToken,
              }))
              .catch((err: unknown) => this.toFailure(op.clientToken, err));
        }
      },
    );

    await execute();
    return Promise.all(opPromises);
  }

  /** Maps a root insert's `items.add` response to the op's result: the new id, wherever the response shape put it. */
  private addResult(clientToken: string) {
    return (r: {
      data?: { Id?: number; ID?: number };
      Id?: number;
      ID?: number;
    }): IBatchOperationResult => {
      const id = r?.data?.Id ?? r?.data?.ID ?? r?.Id ?? r?.ID;
      if (id === undefined) {
        return {
          kind: "failure",
          clientToken,
          status: 500,
          body: "add: missing id in response",
        };
      }
      return { kind: "success", clientToken, serverData: { id } };
    };
  }

  /**
   * Maps a folder insert's `addValidateUpdateItemUsingPath` response to the op's
   * result. The API answers 200 per row: a row carrying HasException is the
   * failure, and the `Id` row carries the new item's id.
   */
  private formValuesResult(clientToken: string) {
    return (rows: ISPFormUpdateValue[]): IBatchOperationResult => {
      const failed = rows.find((r) => r.HasException);
      if (failed) {
        return {
          kind: "failure",
          clientToken,
          status: 400,
          body: failed.ErrorMessage ?? `field '${failed.FieldName}' failed`,
        };
      }
      const idRow = rows.find((r) => r.FieldName === "Id");
      const id = idRow ? Number(idRow.FieldValue) : NaN;
      if (!Number.isFinite(id)) {
        return {
          kind: "failure",
          clientToken,
          status: 500,
          body: "addValidateUpdateItemUsingPath: missing id in response",
        };
      }
      return { kind: "success", clientToken, serverData: { id } };
    };
  }

  // Compose the effective $filter for item reads: the user filter (translated,
  // resolving the list root only when container-scoped) AND the items-only
  // clause — SharePoint interleaves folder rows (FSObjType=1) with items and
  // we exclude them unless containers were requested.
  private async buildItemsFilter(
    list: IListHandle,
    filter: FilterNode | undefined,
    includeContainers: boolean | undefined,
  ): Promise<string | undefined> {
    const ctx =
      filter && containsContainerScope(filter)
        ? { containerBaseUrl: await this.resolveListRootUrl(list) }
        : undefined;
    const user = filter ? toODataString(filter, ctx) : "";
    if (includeContainers) return user || undefined;
    return user ? `(${user}) and FSObjType eq 0` : "FSObjType eq 0";
  }

  /**
   * The list's root folder URL, server-relative, without a trailing slash.
   *
   * Public because it is the ONLY correct answer to "where does this list live":
   * a list's URL comes from its internal name at creation, a later rename leaves
   * it alone, and libraries carry no `/Lists/` segment at all — so composing one
   * from a web URL and a list title is a guess that happens to hold.
   *
   * Memoized for the provider's lifetime: within one page's life a list does not
   * move. The PROMISE is cached rather than the string, so concurrent callers
   * share a single request instead of racing to issue several; a rejected read is
   * evicted so the next caller retries rather than inheriting the failure.
   */
  async resolveListRootUrl(list: IListHandle): Promise<string> {
    const key = `${list.kind}:${list.value}`;
    const hit = this.rootUrlCache.get(key);
    if (hit) return hit;
    const pending = this.readListRootUrl(list);
    this.rootUrlCache.set(key, pending);
    try {
      return await pending;
    } catch (err) {
      this.rootUrlCache.delete(key);
      throw err;
    }
  }

  // SharePoint does NOT expose `RootFolderServerRelativeUrl` as a selectable scalar on
  // the list entity (it silently drops from $select), so read the canonical URL from
  // the rootFolder endpoint itself.
  private async readListRootUrl(list: IListHandle): Promise<string> {
    const rootInfo =
      await this.list(list).rootFolder.select("ServerRelativeUrl")();
    const rawRoot: string | undefined = rootInfo.ServerRelativeUrl;
    if (!rawRoot) {
      throw new Error(
        `could not resolve the target list's root folder URL ` +
          `(RootFolder/ServerRelativeUrl was empty).`,
      );
    }
    return rawRoot.replace(/\/+$/, "");
  }

  // ---- IFileSystem: delegated to SharePointFileSystem ----

  ensureFoldersAsync(
    list: IListHandle,
    listRelativePaths: readonly string[],
  ): Promise<Map<string, string>> {
    return this.files.ensureFoldersAsync(list, listRelativePaths);
  }

  uploadFileAsync(
    list: IListHandle,
    folderServerRelativeUrl: string | null,
    request: IFileUploadRequest,
  ): Promise<IFileUploadResult> {
    return this.files.uploadFileAsync(list, folderServerRelativeUrl, request);
  }

  renameFileAsync(
    list: IListHandle,
    itemId: number,
    newLeafName: string,
  ): Promise<IRenameResult> {
    return this.files.renameFileAsync(list, itemId, newLeafName);
  }

  copyFileAsync(
    sourceList: IListHandle,
    itemId: number,
    destList: IListHandle,
    destListRelativePath: string,
    newLeafName: string,
  ): Promise<IRenameResult> {
    return this.files.copyFileAsync(
      sourceList,
      itemId,
      destList,
      destListRelativePath,
      newLeafName,
    );
  }

  renameFolderAsync(
    list: IListHandle,
    listRelativePath: string,
    newName: string,
  ): Promise<IRenameResult> {
    return this.files.renameFolderAsync(list, listRelativePath, newName);
  }

  deleteFolderAsync(
    list: IListHandle,
    listRelativePath: string,
  ): Promise<void> {
    return this.files.deleteFolderAsync(list, listRelativePath);
  }

  checkinFileAsync(
    list: IListHandle,
    itemId: number,
    comment: string,
  ): Promise<void> {
    return this.files.checkinFileAsync(list, itemId, comment);
  }

  // ---- IChangeFeed: delegated to SharePointChangeFeed ----

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
  }> {
    return this.changes.getListItemChangesSinceToken(
      list,
      token,
      fields,
      expand,
      properties,
    );
  }

  private toFailure(clientToken: string, err: unknown): IBatchOperationResult {
    let status = 0;
    let body: unknown = err;
    if (typeof err === "object" && err) {
      const e = err as { status?: number; message?: string; data?: unknown };
      if (typeof e.status === "number") status = e.status;
      if (e.message) body = e.message;
      if (e.data !== undefined) body = e.data;
    }
    return { kind: "failure", clientToken, status, body };
  }
}
