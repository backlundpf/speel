import type {
  IStorageProvider,
  IFileSystem,
  IChangeFeed,
  IBatchOperation,
  IBatchOperationResult,
  IReadOperation,
  IReadOperationResult,
  IGetItemsOptions,
  IOrderKey,
  IExpandClause,
  IFileUploadRequest,
  IFileUploadResult,
  IRenameResult,
  ISourceHandle,
  IProviderSource,
  IWriteField,
} from "../providers/ISharePointProvider.js";
import { QueryTranslationException } from "../errors.js";
import { dispatchReadOperation } from "../Query/ReadBatch.js";
import { resolvePath } from "../Query/Materialize.js";
import { listKey } from "../Cache/listKey.js";
import type { IListHandle } from "../types.js";
import type { FilterNode } from "../Query/FilterNode.js";
import type { Property } from "../Metadata/Property.js";

function fakeByteSize(content: Blob | ArrayBuffer | string): number {
  if (typeof content === "string") return content.length;
  if (content instanceof ArrayBuffer) return content.byteLength;
  return content.size;
}

/** The parent-folder URL of a server-relative file/folder URL. */
function parentUrlOf(url: string): string {
  return url.slice(0, url.lastIndexOf("/"));
}

/**
 * A stored value is never the caller's instance, and a returned value is never
 * the stored one. A test double that aliased them would show an UNSAVED edit —
 * `entity.TagsId.push(77)` on an array a read handed out — as persisted, which
 * no real provider does. One level is enough: a typed value is a scalar, a
 * `Date`, an array of scalars, or a plain object (an expanded sub-record).
 */
function cloneValue(v: unknown): unknown {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return [...v];
  if (v !== null && typeof v === "object")
    return { ...(v as Record<string, unknown>) };
  return v;
}

/** `cloneValue` over every column of a record. */
function cloneRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(rec)) out[k] = cloneValue(rec[k]);
  return out;
}

function loose(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  return a === b;
}

function cmpVals(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  return 0;
}

/** Write `value` at a '/'-separated path, creating the intermediate objects. */
function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split("/");
  let cur = target;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    cur = (
      next !== null && typeof next === "object" ? next : (cur[part] = {})
    ) as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function evaluateFilter(
  node: FilterNode,
  item: Record<string, unknown>,
  containerBase: string,
): boolean {
  switch (node.kind) {
    case "compare": {
      const a = resolvePath(item, node.column);
      const b = node.value;
      switch (node.op) {
        case "eq":
          return loose(a, b);
        case "ne":
          return !loose(a, b);
        case "gt":
          return cmpVals(a, b) > 0;
        case "ge":
          return cmpVals(a, b) >= 0;
        case "lt":
          return cmpVals(a, b) < 0;
        case "le":
          return cmpVals(a, b) <= 0;
      }
    }
    case "in": {
      const present = node.values.some((v) =>
        loose(resolvePath(item, node.column), v),
      );
      return node.negate ? !present : present;
    }
    case "is-null": {
      const v = resolvePath(item, node.column);
      const isNullish = v === null || v === undefined;
      return node.negate ? !isNullish : isNullish;
    }
    case "string": {
      const s = String(resolvePath(item, node.column) ?? "");
      switch (node.op) {
        case "startsWith":
          return s.startsWith(node.value);
        case "endsWith":
          return s.endsWith(node.value);
        case "contains":
          return s.includes(node.value);
      }
    }
    case "multichoice": {
      const colVal = resolvePath(item, node.column);
      const arr = Array.isArray(colVal) ? (colVal as unknown[]) : [];
      let r: boolean;
      switch (node.op) {
        case "contains":
          r = arr.includes(node.values?.[0]);
          break;
        case "containsAny":
          r = (node.values ?? []).some((v) => arr.includes(v));
          break;
        case "containsAll":
          r = (node.values ?? []).every((v) => arr.includes(v));
          break;
        case "isEmpty":
          r = arr.length === 0;
          break;
      }
      return node.negate ? !r! : r!;
    }
    case "container-scope": {
      const container = (item.__folder as string | undefined) ?? containerBase;
      const url = `${containerBase}/${node.path}`;
      return node.recursive
        ? container === url || container.startsWith(`${url}/`)
        : container === url;
    }
    case "include-containers":
      return true; // hoisted by the executor; neutral if it ever reaches a provider
    case "and":
      return node.children.every((c) => evaluateFilter(c, item, containerBase));
    case "or":
      return node.children.some((c) => evaluateFilter(c, item, containerBase));
    case "not":
      return !evaluateFilter(node.child, item, containerBase);
  }
}

function sortByKeys(
  items: Record<string, unknown>[],
  keys: readonly IOrderKey[],
): Record<string, unknown>[] {
  const sorted = items.slice();
  sorted.sort((x, y) => {
    for (const k of keys) {
      const c = cmpVals(x[k.column], y[k.column]);
      if (c !== 0) return k.direction === "desc" ? -c : c;
    }
    return 0;
  });
  return sorted;
}

interface IFailure {
  status: number;
  body: unknown;
}

/**
 * A principal as the fake stores it — model spelling, one record per id whatever
 * endpoint later serves it. Beyond the model's columns a seed may carry any column
 * the real endpoint holds (`IsSiteAdmin`, `UserPrincipalName`, …): a key projects
 * and filters it as the endpoint would, untranslated.
 */
/** An inline-expand join: a list's rows by id, or the principal registry through a provider source. */
export type IFakeJoin =
  | { foreignKey: string; targetList: IListHandle }
  | { foreignKey: string; targetSource: IProviderSource };

export interface IFakePrincipal {
  Id: number;
  Title: string;
  LoginName: string;
  /** 1 = user, 4 = security group, 8 = SharePoint group. */
  PrincipalType: 1 | 4 | 8;
  Email?: string;
  Description?: string;
  OwnerTitle?: string;
  [column: string]: unknown;
}

type PrincipalSourceKey = "principals" | "siteUsers" | "siteGroups";
const PRINCIPAL_SOURCE_KEYS: readonly PrincipalSourceKey[] = [
  "principals",
  "siteUsers",
  "siteGroups",
];

/**
 * A value of a person field that names a principal — null/undefined and non-numeric
 * values name none. The same rule as @speel/pnpjs's `principalIdOf`: a `null` clear
 * is not "principal 0".
 */
function principalIdOf(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * The columns each key's endpoint has NO counterpart for — exactly the rows
 * @speel/pnpjs marks `null` in its outbound table, kept in lockstep by the
 * conformance suite. A selected one is omitted from the record; a filtered or
 * ordered one is refused. Every OTHER column passes through untranslated, as it
 * does there: projected when the seed holds it, filterable and orderable — the
 * endpoint decides, and on this fake the seed is the endpoint. Uncarried means NOT
 * SELECTABLE: see DERIVED_COLUMNS for the columns a key answers without the
 * endpoint holding them (`PrincipalType` on siteGroups sits there, not here).
 */
const UNCARRIED_COLUMNS: Record<PrincipalSourceKey, ReadonlySet<string>> = {
  principals: new Set(["Description", "OwnerTitle"]),
  siteUsers: new Set(["Description", "OwnerTitle"]),
  siteGroups: new Set(["Email"]),
};

/**
 * Columns a key projects without the endpoint holding them. "Derived" here means
 * the value is computed on the way in — from the UIL's ContentTypeId on `principals`
 * (person or group, nothing finer), a constant 8 on `siteGroups` (web/siteGroups has
 * no PrincipalType column at all; a $filter or $orderby on it would 400). Nothing
 * behind a derived column can be ordered by, and a filter is answerable only where
 * the derivation runs backwards: the UIL's does, as eq/ne/in over {1, 8}; the
 * constant does not. `siteUsers` holds a real PrincipalType and derives nothing.
 */
const DERIVED_COLUMNS: Record<PrincipalSourceKey, ReadonlySet<string>> = {
  principals: new Set(["PrincipalType"]),
  siteUsers: new Set(),
  siteGroups: new Set(["PrincipalType"]),
};

/** The values the UIL's derived PrincipalType can answer a filter for. */
const USER_INFO_LIST_PRINCIPAL_TYPES: readonly number[] = [1, 8];

type FilterLeaf = Exclude<FilterNode, { kind: "and" | "or" | "not" }>;

/** Every leaf of a filter tree — the predicates themselves, with the and/or/not connectives walked through. */
function filterLeaves(node: FilterNode): FilterLeaf[] {
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.flatMap(filterLeaves);
    case "not":
      return filterLeaves(node.child);
    default:
      return [node];
  }
}

/** Whether a PrincipalType predicate sits anywhere in `node`. */
function mentionsPrincipalType(node: FilterNode): boolean {
  switch (node.kind) {
    case "and":
    case "or":
      return node.children.some(mentionsPrincipalType);
    case "not":
      return mentionsPrincipalType(node.child);
    default:
      return "column" in node && node.column === "PrincipalType";
  }
}

/**
 * The UIL's PrincipalType translation does not push through a `not`. Directly over
 * the compare/in leaf the negation folds into the leaf (eq↔ne, in↔not in), and this
 * fake evaluates that correctly; anywhere deeper the real provider would have to
 * emit `not (startswith …)` over a content-type test, which SharePoint 400s, so it
 * refuses the tree — and this fake refuses the same trees, in the same words.
 */
function assertNoNegatedPrincipalType(node: FilterNode): void {
  switch (node.kind) {
    case "and":
    case "or":
      node.children.forEach(assertNoNegatedPrincipalType);
      return;
    case "not": {
      const child = node.child;
      const directlyOverLeaf =
        (child.kind === "compare" || child.kind === "in") &&
        child.column === "PrincipalType";
      if (!directlyOverLeaf && mentionsPrincipalType(child)) {
        throw new QueryTranslationException(
          `The User Information List cannot negate a content-type test: a PrincipalType ` +
            `predicate under 'not' on the principals source has no expressible form. ` +
            `Rewrite the predicate without 'not' (PrincipalType ne / not in, or the ` +
            `complementary value).`,
          node,
        );
      }
      // Below here either sits the one leaf, or nothing that mentions PrincipalType.
      return;
    }
    default:
      return;
  }
}

export class FakeStorageProvider
  implements IStorageProvider, IFileSystem, IChangeFeed
{
  private readonly stores = new Map<
    string,
    Map<number, Record<string, unknown>>
  >();
  // listKey -> set of list-relative folder paths that have been created.
  private readonly folderPaths = new Map<string, Set<string>>();
  // listKey -> (serverRelativeUrl -> itemId) for uploaded files.
  private readonly filesByUrl = new Map<string, Map<string, number>>();
  private readonly nextIds = new Map<string, number>();
  private readonly failures = new Map<string, IFailure>();

  // Change log for getListItemChangesSinceToken. A global monotonic seq is
  // stamped on every add/update and on each delete; the change token is just
  // that seq stringified.
  private seq = 0;
  private readonly modSeq = new Map<string, Map<number, number>>();
  private readonly deleteLog = new Map<string, { id: number; seq: number }[]>();

  // listKey -> ids recycled / hard-deleted, in call order.
  private readonly recycleLog = new Map<string, number[]>();
  private readonly hardDeleteLog = new Map<string, number[]>();
  // listKey -> files checked in, with their comments, in call order.
  private readonly checkinLog = new Map<
    string,
    { id: number; comment: string }[]
  >();

  /** Test probe: ids recycled on a list, in order. */
  recycledIds(list: IListHandle): number[] {
    return [...(this.recycleLog.get(listKey(list)) ?? [])];
  }
  /** Test probe: ids permanently deleted on a list, in order. */
  hardDeletedIds(list: IListHandle): number[] {
    return [...(this.hardDeleteLog.get(listKey(list)) ?? [])];
  }

  private bump(list: IListHandle, id: number): void {
    const k = listKey(list);
    let m = this.modSeq.get(k);
    if (!m) {
      m = new Map();
      this.modSeq.set(k, m);
    }
    m.set(id, ++this.seq);
  }

  private logDelete(list: IListHandle, id: number): void {
    const k = listKey(list);
    this.modSeq.get(k)?.delete(id);
    let log = this.deleteLog.get(k);
    if (!log) {
      log = [];
      this.deleteLog.set(k, log);
    }
    log.push({ id, seq: ++this.seq });
  }

  /** Test probe: the modification sequence stamped on an item, or 0 if never written. */
  modificationCountFor(list: IListHandle, id: number): number {
    return this.modSeq.get(listKey(list))?.get(id) ?? 0;
  }

  // joins[listKey] -> { navColumn -> { foreignKey, targetList | targetSource } }
  private readonly joins = new Map<string, Map<string, IFakeJoin>>();

  // ---- Provider sources -------------------------------------------------------
  // One registry of every principal the site has seen, in MODEL spelling, keyed by
  // id — users and groups share the id space, exactly as the User Information List
  // does. The three provider keys are views over it: principals → every record;
  // siteUsers → PrincipalType 1 and 4 (web/siteusers returns claims security groups
  // too); siteGroups → PrincipalType 8.
  private readonly principalsById = new Map<number, IFakePrincipal>();
  // Ids whose LoginName this fake has handed out through a provider-source read —
  // not every id a read returned. A claims write needs the login, so only a read
  // that SELECTED LoginName and found one leaves the provider holding what a later
  // form-values write needs; such a write names these ids without a registry
  // lookup — the "immutable once seen" policy. A bare count, or a read of
  // Id/Title alone, warms nothing.
  private readonly returnedPrincipalIds = new Set<number>();
  private readonly principalResolveLog: number[] = [];

  seedPrincipal(p: IFakePrincipal): void {
    this.principalsById.set(p.Id, { ...p });
  }

  /** Ids a write had to look up in the registry because no read had returned them yet. */
  principalResolves(): readonly number[] {
    return [...this.principalResolveLog];
  }

  private principalSource(source: IProviderSource): PrincipalSourceKey {
    if (!(PRINCIPAL_SOURCE_KEYS as readonly string[]).includes(source.key)) {
      throw new Error(
        `FakeStorageProvider: unknown provider source '${source.key}'. ` +
          `Served: ${PRINCIPAL_SOURCE_KEYS.join(", ")}.`,
      );
    }
    return source.key as PrincipalSourceKey;
  }

  /** The view a key exposes, in id order. The UIL collapses 4 into 8 — it cannot tell a security group from a SharePoint group. */
  private principalsFor(key: PrincipalSourceKey): IFakePrincipal[] {
    const all = [...this.principalsById.values()].sort((a, b) => a.Id - b.Id);
    switch (key) {
      case "siteUsers":
        return all.filter((p) => p.PrincipalType !== 8);
      case "siteGroups":
        return all.filter((p) => p.PrincipalType === 8);
      case "principals":
        return all.map((p) =>
          p.PrincipalType === 4 ? { ...p, PrincipalType: 8 } : p,
        );
    }
  }

  private projectPrincipal(
    key: PrincipalSourceKey,
    p: IFakePrincipal,
    fields: readonly string[],
  ): Record<string, unknown> {
    const uncarried = UNCARRIED_COLUMNS[key];
    const out: Record<string, unknown> = { Id: p.Id };
    for (const f of fields) {
      if (f === "Id" || f === "ID" || uncarried.has(f)) continue;
      // Any other column the seed holds passes through — the endpoint decides.
      const v = p[f];
      if (v !== undefined) out[f] = v;
    }
    // The projected record, not the registry, decides: only a read that carried
    // the login home leaves the provider able to write this id as a claims Key.
    if (typeof out.LoginName === "string" && out.LoginName !== "") {
      this.returnedPrincipalIds.add(p.Id);
    }
    return out;
  }

  /**
   * A provider-source read never silently drops a predicate: anything the key cannot
   * evaluate is refused up front rather than answered with an empty page. A column
   * outside the uncarried set is evaluated as given, whatever it is called — the
   * endpoint decides, as it does for the real provider.
   */
  private assertCarriedForQuery(
    key: PrincipalSourceKey,
    options: IGetItemsOptions | undefined,
  ): void {
    this.assertNotExpanded(key, options?.expand);
    if (key === "principals" && options?.filter) {
      assertNoNegatedPrincipalType(options.filter);
    }
    for (const leaf of options?.filter ? filterLeaves(options.filter) : []) {
      // Principals live in no folder; a container predicate would match nothing.
      if (
        leaf.kind === "container-scope" ||
        leaf.kind === "include-containers"
      ) {
        throw new QueryTranslationException(
          `Provider source '${key}' has no containers; a '${leaf.kind}' predicate cannot be applied to it.`,
          leaf,
        );
      }
      if (UNCARRIED_COLUMNS[key].has(leaf.column)) {
        throw new QueryTranslationException(
          `Provider source '${key}' has no column '${leaf.column}'; it cannot be filtered on.`,
          leaf,
        );
      }
      if (DERIVED_COLUMNS[key].has(leaf.column)) {
        // Only the UIL's derivation runs backwards into a filter.
        if (key !== "principals") {
          throw new QueryTranslationException(
            `Provider source '${key}' has no column '${leaf.column}'; every record it returns is a SharePoint group (8), so there is nothing to filter on.`,
            leaf,
          );
        }
        this.assertUserInfoListPrincipalType(leaf);
      }
    }
    for (const k of options?.orderBy ?? []) {
      if (UNCARRIED_COLUMNS[key].has(k.column)) {
        throw new Error(
          `Provider source '${key}' has no column '${k.column}'; it cannot be ordered by.`,
        );
      }
      if (DERIVED_COLUMNS[key].has(k.column)) {
        throw new Error(
          `${k.column} is derived on the '${key}' source and cannot order it.`,
        );
      }
    }
  }

  /**
   * The UIL derives PrincipalType from a content type that tells person from group
   * and nothing finer, so a filter on it translates only as eq/ne/in over {1, 8}:
   * `eq 1` is a prefix test on ContentTypeId, `eq 8` its negation. Any other value,
   * operator or predicate shape has no translation and is refused — answering
   * `eq 4` with "every group" would hand back records whose own PrincipalType reads 8.
   */
  private assertUserInfoListPrincipalType(leaf: FilterLeaf): void {
    if (leaf.kind !== "compare" && leaf.kind !== "in") {
      throw new QueryTranslationException(
        `PrincipalType on the principals source cannot be used in a '${leaf.kind}' filter.`,
        leaf,
      );
    }
    if (leaf.kind === "compare" && leaf.op !== "eq" && leaf.op !== "ne") {
      throw new QueryTranslationException(
        `PrincipalType on the principals source supports only eq/ne/in (got ${leaf.op}).`,
        leaf,
      );
    }
    const values = leaf.kind === "in" ? leaf.values : [leaf.value];
    for (const v of values) {
      if (!USER_INFO_LIST_PRINCIPAL_TYPES.includes(Number(v))) {
        throw new QueryTranslationException(
          `The User Information List distinguishes only users (PrincipalType 1) from groups (8); ${String(v)} cannot be expressed there.`,
          leaf,
        );
      }
    }
  }

  private assertNotExpanded(
    key: PrincipalSourceKey,
    expand: readonly IExpandClause[] | undefined,
  ): void {
    if (expand?.length) {
      throw new Error(
        `Provider source '${key}' cannot be expanded; it has no navigations.`,
      );
    }
  }

  private principalsPaged(
    source: IProviderSource,
    fields: readonly string[],
    pageSize: number,
    cursor: string | undefined,
    options: IGetItemsOptions | undefined,
  ): { items: Record<string, unknown>[]; nextCursor: string | null } {
    const key = this.principalSource(source);
    this.assertCarriedForQuery(key, options);
    // List rows expose the id under both spellings, so filter and sort must see
    // both too; the alias is for evaluation only — projection still answers `Id`.
    let all: Record<string, unknown>[] = this.principalsFor(key).map((p) => ({
      ...p,
      ID: p.Id,
    }));
    if (options?.filter) {
      all = all.filter((p) => evaluateFilter(options.filter!, p, ""));
    }
    if (options?.orderBy?.length) all = sortByKeys(all, options.orderBy);
    if (options?.skip && options.skip > 0) all = all.slice(options.skip);
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = all.slice(start, start + pageSize);
    return {
      items: slice.map((p) =>
        this.projectPrincipal(key, p as unknown as IFakePrincipal, fields),
      ),
      nextCursor:
        start + pageSize < all.length ? String(start + pageSize) : null,
    };
  }

  /**
   * Apply typed fields to a record — the fake's whole write encoding, which is
   * none: every value lands under `property.columnName` exactly as given (a
   * `Date` stays a `Date`, an array an array, a single lookup id a number), and a
   * read returns it the same way. The one branch is the person check.
   *
   * A person column (a Lookup/User whose target source is not a list) is
   * validated by the PROVIDER, on all three write paths — root insert, folder
   * insert, update — an id the site has never seen fails the field. SharePoint
   * checks none of them: the form-values API takes claims Keys the provider must
   * resolve from ids, and the JSON API does not check a person id at all —
   * `items.add` answers 201 to an id the site has never issued and stores a
   * dangling one (verified live, 2026-09-14); `items.update` is the same JSON
   * path and is treated the same way (inferred, not separately observed). So
   * the real provider resolves every principal a write names through the User
   * Information List, whichever API it then takes,
   * and this fake models that: an id no read has returned costs a registry
   * lookup, logged as one; an id this fake has already handed out is trusted, and
   * a resolved id is remembered. A `null` value names no principal — it is a
   * clear, stored as null.
   *
   * Returns null on success, or the first failing field's message.
   */
  private applyFields(
    rec: Record<string, unknown>,
    fields: readonly IWriteField[],
  ): string | null {
    for (const { property, value } of fields) {
      const { config } = property;
      if (
        config.kind === "Lookup" &&
        config.target.source.kind === "provider"
      ) {
        // Rule 1 on the write side: the target must name a key this fake serves.
        try {
          this.principalSource(config.target.source);
        } catch (err) {
          return `Field '${property.columnName}': ${(err as Error).message}`;
        }
        const ids = (
          config.multi ? (Array.isArray(value) ? value : []) : [value]
        )
          .map(principalIdOf)
          .filter((id): id is number => id !== undefined);
        for (const id of ids) {
          if (this.returnedPrincipalIds.has(id)) continue;
          this.principalResolveLog.push(id);
          const found = this.principalsById.get(id);
          if (!found) {
            return `Field '${property.columnName}': principal ${id} is not in the User Information List.`;
          }
          // A registry hit with no login resolves nothing: the real provider
          // needs the login to spell the claims Key and refuses an empty one,
          // on the root path too (an empty Key is one more thing SharePoint
          // accepts with a 200 and stores nothing).
          if (found.LoginName === "") {
            return `Field '${property.columnName}': principal ${id} has no login name; a person column is written by claims Key, so it cannot be resolved.`;
          }
          this.returnedPrincipalIds.add(id);
        }
      }
      // Stored as a copy: the caller's array or Date stays the caller's.
      rec[property.columnName] = cloneValue(value);
    }
    return null;
  }

  // listKey → (itemId → (navColumn → raw payload)) for special-expand clauses.
  private readonly expandPayloads = new Map<
    string,
    Map<number, Map<string, unknown>>
  >();

  /**
   * Seed the raw payload a special-expand clause returns for one item, keyed by the
   * clause's navColumn. Stored as given (wire shape), so the registered handler's
   * materializer is exercised for real.
   */
  seedExpandPayload(
    list: IListHandle,
    itemId: number,
    navColumn: string,
    payload: unknown,
  ): void {
    const k = listKey(list);
    let byItem = this.expandPayloads.get(k);
    if (!byItem) {
      byItem = new Map();
      this.expandPayloads.set(k, byItem);
    }
    let byNav = byItem.get(itemId);
    if (!byNav) {
      byNav = new Map();
      byItem.set(itemId, byNav);
    }
    byNav.set(navColumn, payload);
  }

  /** Store one TYPED record under a fresh id — the seed for tests that need rows without going through a write op. The row holds copies: mutating `record` afterwards changes nothing stored. */
  seedRow(list: IListHandle, record: Record<string, unknown>): number {
    const id = this.nextId(list);
    this.store(list).set(id, { ID: id, ...cloneRecord(record) });
    this.bump(list, id);
    return id;
  }

  /** Merge raw fields onto a stored item record (test seeding for read-only columns). */
  seedItemFields(
    list: IListHandle,
    itemId: number,
    fields: Record<string, unknown>,
  ): void {
    const rec = this.store(list).get(itemId);
    if (!rec) {
      throw new Error(
        `seedItemFields: no item ${itemId} in ${listKey(list)} — add it first.`,
      );
    }
    Object.assign(rec, fields);
  }

  /**
   * Teach an inline `$expand` where `navColumn` resolves: another list's rows, or
   * — for a person column — the principal registry through a provider source.
   */
  registerJoin(list: IListHandle, navColumn: string, def: IFakeJoin): void {
    const k = listKey(list);
    let m = this.joins.get(k);
    if (!m) {
      m = new Map();
      this.joins.set(k, m);
    }
    m.set(navColumn, def);
  }

  private joinExpands(
    list: IListHandle,
    item: Record<string, unknown>,
    expands: readonly IExpandClause[],
  ): Record<string, unknown> {
    const map = this.joins.get(listKey(list));
    if (!map) return item;
    const out = { ...item };
    for (const ex of expands) {
      const def = map.get(ex.navColumn);
      if (!def) continue;
      const fkVal = item[def.foreignKey];
      if (fkVal === undefined || fkVal === null) continue;
      const ids: number[] = Array.isArray(fkVal)
        ? (fkVal as number[])
        : [fkVal as number];
      if ("targetSource" in def) {
        const key = this.principalSource(def.targetSource);
        const byId = new Map(this.principalsFor(key).map((p) => [p.Id, p]));
        const project = (p: IFakePrincipal) =>
          this.projectPersonExpand(p, ex.selectFields);
        if (Array.isArray(fkVal)) {
          out[ex.navColumn] = ids
            .map((id) => byId.get(id))
            .filter((p): p is IFakePrincipal => p !== undefined)
            .map(project);
        } else {
          const p = byId.get(ids[0]!);
          if (p) out[ex.navColumn] = project(p);
        }
        continue;
      }
      const targetMap = this.store(def.targetList);
      if (Array.isArray(fkVal)) {
        out[ex.navColumn] = ids
          .map((id) => targetMap.get(id))
          .filter((r): r is Record<string, unknown> => r !== undefined)
          .map((r) => this.project(r, ["ID", ...ex.selectFields]));
      } else {
        const r = targetMap.get(ids[0]!);
        if (r) out[ex.navColumn] = this.project(r, ["ID", ...ex.selectFields]);
      }
    }
    return out;
  }

  /**
   * What an inline person expand can answer — Id, Title, LoginName, Email — and
   * nothing else, whatever was asked: SharePoint fails the whole query for more,
   * and the real provider drops the rest. Not a harvest: an expand hands out no
   * claims-ready login, on either provider.
   */
  private projectPersonExpand(
    p: IFakePrincipal,
    fields: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { Id: p.Id };
    for (const f of fields) {
      if (
        (f === "Title" || f === "LoginName" || f === "Email") &&
        p[f] !== undefined
      )
        out[f] = p[f];
    }
    return out;
  }

  failOn(clientToken: string, failure: IFailure): void {
    this.failures.set(clientToken, failure);
  }

  private store(list: IListHandle): Map<number, Record<string, unknown>> {
    const k = listKey(list);
    let m = this.stores.get(k);
    if (!m) {
      m = new Map();
      this.stores.set(k, m);
    }
    return m;
  }

  private nextId(list: IListHandle): number {
    const k = listKey(list);
    const n = (this.nextIds.get(k) ?? 0) + 1;
    this.nextIds.set(k, n);
    return n;
  }

  private project(
    item: Record<string, unknown>,
    fields: readonly string[],
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { ID: item.ID };
    for (const f of fields) {
      if (f === "ID" || f === "Id") continue;
      if (f.includes("/")) {
        // An expanded OData path ('File/Length'). SharePoint returns these nested
        // under the expanded object rather than as a flat key, so mirror that shape —
        // Materialize walks the path. An absent link projects nothing.
        const v = resolvePath(item, f);
        if (v !== undefined) setPath(out, f, cloneValue(v));
        continue;
      }
      // A copy goes out, never the stored value: a read must not hand the
      // caller a handle on the row.
      if (f in item) out[f] = cloneValue(item[f]);
    }
    return out;
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
    const [item] = await this.getItemsByIdsAsync(source, [id], fields, opts);
    return item ?? null;
  }

  // `properties` is accepted and ignored on every read: this fake stores typed
  // values and returns them, so there is nothing to type.
  async getItemsByIdsAsync(
    source: ISourceHandle,
    ids: readonly number[],
    fields: readonly string[],
    opts?: {
      expand?: readonly IExpandClause[];
      properties?: readonly Property[];
    },
  ): Promise<readonly (Record<string, unknown> | null)[]> {
    if (source.kind === "provider") {
      const key = this.principalSource(source);
      this.assertNotExpanded(key, opts?.expand);
      const view = new Map(this.principalsFor(key).map((p) => [p.Id, p]));
      return ids.map((id) => {
        const p = view.get(id);
        return p ? this.projectPrincipal(key, p, fields) : null;
      });
    }
    const m = this.store(source);
    return ids.map((id) => {
      const item = m.get(id);
      if (!item) return null;
      const projected = this.project(item, fields);
      if (opts?.expand?.length) {
        const expanded = this.joinExpands(source, item, opts.expand!);
        for (const ex of opts.expand) {
          if (expanded[ex.navColumn] !== undefined)
            projected[ex.navColumn] = expanded[ex.navColumn];
        }
      }
      return projected;
    });
  }

  async getItemsPagedAsync(
    source: ISourceHandle,
    fields: readonly string[],
    pageSize: number,
    cursor?: string,
    options?: IGetItemsOptions,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    if (source.kind === "provider") {
      return this.principalsPaged(source, fields, pageSize, cursor, options);
    }
    let all = Array.from(this.store(source).values()).sort(
      (a, b) => (a.ID as number) - (b.ID as number),
    );
    const containerBase = `/sites/dev/${source.value}`;
    if (!options?.includeContainers) {
      all = all.filter((item) => item.FSObjType !== 1);
    }
    if (options?.expand?.length) {
      all = all.map((item) => this.joinExpands(source, item, options.expand!));
    }
    if (options?.filter) {
      all = all.filter((item) =>
        evaluateFilter(options.filter!, item, containerBase),
      );
    }
    if (options?.orderBy?.length) {
      all = sortByKeys(all, options.orderBy);
    }
    if (options?.skip && options.skip > 0) {
      all = all.slice(options.skip);
    }
    const start = cursor ? parseInt(cursor, 10) : 0;
    const slice = all.slice(start, start + pageSize);
    const next =
      start + pageSize < all.length ? String(start + pageSize) : null;
    // Project the requested fields per item but PRESERVE any expanded nav sub-records.
    return {
      items: slice.map((i) => {
        const projected = this.project(i, fields);
        if (options?.expand?.length) {
          for (const ex of options.expand) {
            if (i[ex.navColumn] !== undefined)
              projected[ex.navColumn] = i[ex.navColumn];
            // Not a registered join — attach any payload seeded for this clause (the
            // special-expand path; seedExpandPayload stores the raw wire shape).
            const seeded = this.expandPayloads
              .get(listKey(source))
              ?.get(i.ID as number)
              ?.get(ex.navColumn);
            if (seeded !== undefined) projected[ex.navColumn] = seeded;
            // Top-level selectPaths ride the clause: project them from the item
            // record like any other selected field.
            for (const path of ex.selectPaths ?? []) {
              if (!path.includes("/") && i[path] !== undefined) {
                projected[path] = cloneValue(i[path]);
              }
            }
          }
        }
        return projected;
      }),
      nextCursor: next,
    };
  }

  async countAsync(
    source: ISourceHandle,
    options?: { filter?: FilterNode; includeContainers?: boolean },
  ): Promise<number> {
    if (source.kind === "provider") {
      return this.principalsPaged(
        source,
        ["Id"],
        Number.MAX_SAFE_INTEGER,
        undefined,
        options?.filter ? { filter: options.filter } : undefined,
      ).items.length;
    }
    const containerBase = `/sites/dev/${source.value}`;
    let all = Array.from(this.store(source).values());
    if (!options?.includeContainers) {
      all = all.filter((item) => item.FSObjType !== 1);
    }
    if (!options?.filter) return all.length;
    return all.filter((item) =>
      evaluateFilter(options.filter!, item, containerBase),
    ).length;
  }

  async getListItemChangesSinceToken(
    list: IListHandle,
    token: string,
    fields: readonly string[],
    expand?: readonly IExpandClause[],
    _properties?: readonly Property[],
  ): Promise<{
    changed: Record<string, unknown>[];
    deletedIds: number[];
    newToken: string;
  }> {
    const k = listKey(list);
    const sinceSeq = token === "" ? -1 : Number(token);
    const store = this.store(list);
    const mods = this.modSeq.get(k) ?? new Map<number, number>();

    const changedRaw: Record<string, unknown>[] = [];
    for (const [id, seq] of mods) {
      if (seq > sinceSeq) {
        const item = store.get(id);
        if (item) changedRaw.push(item);
      }
    }
    changedRaw.sort((a, b) => (a.ID as number) - (b.ID as number));

    const changed = changedRaw.map((item) => {
      const withJoins = expand?.length
        ? this.joinExpands(list, item, expand)
        : item;
      const projected = this.project(withJoins, fields);
      if (expand?.length) {
        for (const ex of expand) {
          if (withJoins[ex.navColumn] !== undefined)
            projected[ex.navColumn] = withJoins[ex.navColumn];
        }
      }
      return projected;
    });

    const log = this.deleteLog.get(k) ?? [];
    const deletedIds =
      token === "" ? [] : log.filter((d) => d.seq > sinceSeq).map((d) => d.id);

    return { changed, deletedIds, newToken: String(this.seq) };
  }

  /** Test helper: list-relative folder paths created for a list. */
  getFolders(list: IListHandle): string[] {
    return [...(this.folderPaths.get(listKey(list)) ?? [])];
  }

  async ensureFoldersAsync(
    list: IListHandle,
    listRelativePaths: readonly string[],
  ): Promise<Map<string, string>> {
    const k = listKey(list);
    let set = this.folderPaths.get(k);
    if (!set) {
      set = new Set<string>();
      this.folderPaths.set(k, set);
    }
    const rootUrl = `/sites/dev/${list.value}`;
    const out = new Map<string, string>();
    for (const path of listRelativePaths) {
      let acc = "";
      for (const seg of path.split("/")) {
        if (seg === "") continue; // mirror the real provider's defensive skip
        const parentUrl = acc ? `${rootUrl}/${acc}` : rootUrl;
        acc = acc ? `${acc}/${seg}` : seg;
        if (!set.has(acc)) {
          set.add(acc);
          // Materialize the folder as a row, like SharePoint does (FSObjType=1),
          // so the items-only default is genuinely exercised in tests.
          const id = this.nextId(list);
          this.store(list).set(id, {
            ID: id,
            FSObjType: 1,
            FileLeafRef: seg,
            FileRef: `${rootUrl}/${acc}`,
            __folder: parentUrl,
          });
          this.bump(list, id);
        }
      }
      out.set(path, `${rootUrl}/${path}`);
    }
    return out;
  }

  /** Test helper: server-relative URLs of files uploaded to a list. */
  getFiles(list: IListHandle): string[] {
    return [...(this.filesByUrl.get(listKey(list))?.keys() ?? [])];
  }

  async uploadFileAsync(
    list: IListHandle,
    folderServerRelativeUrl: string | null,
    request: IFileUploadRequest,
  ): Promise<IFileUploadResult> {
    if (request.signal?.aborted) {
      const e = new Error("File upload aborted.");
      e.name = "AbortError";
      throw e;
    }
    const folderUrl = folderServerRelativeUrl ?? `/sites/dev/${list.value}`;
    const serverRelativeUrl = `${folderUrl}/${request.fileName}`;
    const bytesTotal = fakeByteSize(request.content);
    const rec: Record<string, unknown> = {
      __folder: folderUrl,
      FileLeafRef: request.fileName,
      FileRef: serverRelativeUrl,
      // The file object, nested as SharePoint returns it under $expand=File, but
      // TYPED: this fake returns what a provider hands core after coercion, so
      // Length is a number here even though it is an Int64 string on the wire.
      File: { Length: bytesTotal },
      // An uploaded file is checked in, and SharePoint says so explicitly — an
      // empty user field comes back null, not absent. Callers distinguish
      // "loaded and checked in" (null) from "never loaded" (undefined).
      CheckoutUserId: null,
    };
    if (request.fields) {
      // Typed fields are applied BEFORE anything is stored: the real provider
      // encodes them — resolving every principal they name — before a byte moves,
      // so a refused principal leaves no file and no item behind. Nothing below
      // has run when this throws: no id taken, no store, no change-log entry.
      const invalid = this.applyFields(rec, request.fields);
      if (invalid) {
        throw new Error(`uploadFileAsync: ${invalid} Nothing was uploaded.`);
      }
    }
    const k = listKey(list);
    let files = this.filesByUrl.get(k);
    if (!files) {
      files = new Map();
      this.filesByUrl.set(k, files);
    }
    const existing = files.get(serverRelativeUrl);
    if (existing !== undefined && !request.overwrite) {
      throw new Error(`File '${serverRelativeUrl}' already exists.`);
    }
    request.onProgress?.({ bytesUploaded: bytesTotal, bytesTotal });
    const id = existing ?? this.nextId(list);
    rec.ID = id;
    this.store(list).set(id, rec);
    files.set(serverRelativeUrl, id);
    this.bump(list, id);
    return { id, fileName: request.fileName, serverRelativeUrl };
  }

  async renameFileAsync(
    list: IListHandle,
    itemId: number,
    newLeafName: string,
  ): Promise<IRenameResult> {
    const item = this.store(list).get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} was not found.`);
    }
    const currentUrl = item.FileRef;
    if (typeof currentUrl !== "string" || currentUrl === "") {
      throw new Error(`Item ${itemId} has no FileRef — it is not file-backed.`);
    }
    const destUrl = `${parentUrlOf(currentUrl)}/${newLeafName}`;
    const files = this.filesByUrl.get(listKey(list));
    // Mirrors a move with overwrite=false: an occupied destination fails, and the
    // file's own current name counts as occupied.
    if (files?.has(destUrl)) {
      throw new Error(`File '${destUrl}' already exists.`);
    }
    item.FileLeafRef = newLeafName;
    item.FileRef = destUrl;
    if (files?.has(currentUrl)) {
      files.delete(currentUrl);
      files.set(destUrl, itemId);
    }
    this.bump(list, itemId);
    return { name: newLeafName, serverRelativeUrl: destUrl };
  }

  async copyFileAsync(
    sourceList: IListHandle,
    itemId: number,
    destList: IListHandle,
    destListRelativePath: string,
    newLeafName: string,
  ): Promise<IRenameResult> {
    const item = this.store(sourceList).get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} was not found.`);
    }
    const sourceUrl = item.FileRef;
    if (typeof sourceUrl !== "string" || sourceUrl === "") {
      throw new Error(`Item ${itemId} has no FileRef — it is not file-backed.`);
    }
    const rootUrl = `/sites/dev/${destList.value}`;
    if (
      destListRelativePath !== "" &&
      !this.folderPaths.get(listKey(destList))?.has(destListRelativePath)
    ) {
      throw new Error(`Folder '${destListRelativePath}' was not found.`);
    }
    const folderUrl = destListRelativePath
      ? `${rootUrl}/${destListRelativePath}`
      : rootUrl;
    const destUrl = `${folderUrl}/${newLeafName}`;
    const k = listKey(destList);
    let files = this.filesByUrl.get(k);
    if (!files) {
      files = new Map();
      this.filesByUrl.set(k, files);
    }
    if (files.has(destUrl)) {
      throw new Error(`File '${destUrl}' already exists.`);
    }
    const id = this.nextId(destList);
    this.store(destList).set(id, {
      ID: id,
      __folder: folderUrl,
      FileLeafRef: newLeafName,
      FileRef: destUrl,
    });
    files.set(destUrl, id);
    this.bump(destList, id);
    return { name: newLeafName, serverRelativeUrl: destUrl };
  }

  async renameFolderAsync(
    list: IListHandle,
    listRelativePath: string,
    newName: string,
  ): Promise<IRenameResult> {
    const k = listKey(list);
    const paths = this.folderPaths.get(k);
    if (!paths?.has(listRelativePath)) {
      throw new Error(`Folder '${listRelativePath}' was not found.`);
    }
    const slash = listRelativePath.lastIndexOf("/");
    const destPath =
      slash < 0 ? newName : `${listRelativePath.slice(0, slash)}/${newName}`;
    if (paths.has(destPath)) {
      throw new Error(`Folder '${destPath}' already exists.`);
    }
    const rootUrl = `/sites/dev/${list.value}`;
    const oldUrl = `${rootUrl}/${listRelativePath}`;
    const newUrl = `${rootUrl}/${destPath}`;
    // A move takes the whole subtree with it, so every path at or under the old
    // one is re-keyed. Anything the fake stores as a URL — folder rows, file
    // rows, the url→id index — has to follow, or later reads would see a tree
    // SharePoint no longer has.
    const rewrite = (url: string): string =>
      url === oldUrl || url.startsWith(`${oldUrl}/`)
        ? newUrl + url.slice(oldUrl.length)
        : url;

    for (const p of [...paths]) {
      if (p !== listRelativePath && !p.startsWith(`${listRelativePath}/`))
        continue;
      paths.delete(p);
      paths.add(destPath + p.slice(listRelativePath.length));
    }

    for (const [id, item] of this.store(list)) {
      let touched = false;
      for (const field of ["__folder", "FileDirRef"]) {
        const dir = item[field];
        if (typeof dir !== "string") continue;
        const next = rewrite(dir);
        if (next === dir) continue;
        item[field] = next;
        touched = true;
      }
      const ref = item.FileRef;
      if (typeof ref === "string") {
        const next = rewrite(ref);
        if (next !== ref) {
          item.FileRef = next;
          // The renamed folder's own row also gets a new leaf name.
          if (ref === oldUrl) item.FileLeafRef = newName;
          touched = true;
        }
      }
      if (touched) this.bump(list, id);
    }

    const files = this.filesByUrl.get(k);
    if (files) {
      for (const [url, id] of [...files]) {
        const next = rewrite(url);
        if (next === url) continue;
        files.delete(url);
        files.set(next, id);
      }
    }
    return { name: newName, serverRelativeUrl: newUrl };
  }

  async deleteFolderAsync(
    list: IListHandle,
    listRelativePath: string,
  ): Promise<void> {
    const k = listKey(list);
    const paths = this.folderPaths.get(k);
    if (!paths?.has(listRelativePath)) {
      throw new Error(`Folder '${listRelativePath}' was not found.`);
    }
    const folderUrl = `/sites/dev/${list.value}/${listRelativePath}`;
    // SP.Folder.Recycle takes the folder AND everything under it as one
    // recycle-bin entry, with no emptiness check (that is deleteWithParams'
    // DeleteIfEmpty, a different verb). So the whole subtree goes.
    const under = (url: string): boolean =>
      url === folderUrl || url.startsWith(`${folderUrl}/`);

    for (const p of [...paths]) {
      if (p === listRelativePath || p.startsWith(`${listRelativePath}/`))
        paths.delete(p);
    }

    const store = this.store(list);
    for (const [id, item] of [...store]) {
      // Files and folder rows are located by FileRef; an item merely placed in a
      // folder (a folder insert) has only a container field, so check those too.
      const inFolder = ["FileRef", "__folder", "FileDirRef"].some((field) => {
        const v = item[field];
        return typeof v === "string" && under(v);
      });
      if (!inFolder) continue;
      store.delete(id);
      this.logDelete(list, id);
      const ids = this.recycleLog.get(k) ?? [];
      ids.push(id);
      this.recycleLog.set(k, ids);
    }

    const files = this.filesByUrl.get(k);
    if (files) {
      for (const url of [...files.keys()]) {
        if (under(url)) files.delete(url);
      }
    }
  }

  /**
   * Test helper: mark an uploaded file as checked out to `userId`, the state
   * SharePoint puts a document in when someone checks it out. There is no
   * checkout verb on the provider contract yet, so tests seed the state.
   */
  checkOutFile(list: IListHandle, itemId: number, userId: number): void {
    const item = this.store(list).get(itemId);
    if (!item) throw new Error(`Item ${itemId} was not found.`);
    item.CheckoutUserId = userId;
    this.bump(list, itemId);
  }

  /** Test probe: files checked in on a list, with their comments, in order. */
  checkins(list: IListHandle): { id: number; comment: string }[] {
    return [...(this.checkinLog.get(listKey(list)) ?? [])];
  }

  async checkinFileAsync(
    list: IListHandle,
    itemId: number,
    comment: string,
  ): Promise<void> {
    const item = this.store(list).get(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} was not found.`);
    }
    if (typeof item.FileRef !== "string" || item.FileRef === "") {
      throw new Error(`Item ${itemId} has no FileRef — it is not file-backed.`);
    }
    const checkedOutTo = item.CheckoutUserId;
    if (checkedOutTo === undefined || checkedOutTo === null) {
      throw new Error(`The file '${item.FileRef}' is not checked out.`);
    }
    // Checked in: the checkout user goes empty, the way the server reports it.
    item.CheckoutUserId = null;
    this.bump(list, itemId);
    const k = listKey(list);
    const log = this.checkinLog.get(k) ?? [];
    log.push({ id: itemId, comment });
    this.checkinLog.set(k, log);
  }

  /**
   * The fake has no real batching, so it satisfies the contract the honest way:
   * each descriptor runs through the method it names, fully drained. What it does
   * give tests is a single call site per include level to count.
   */
  async executeReadBatchAsync(
    operations: readonly IReadOperation[],
  ): Promise<readonly IReadOperationResult[]> {
    const out: IReadOperationResult[] = [];
    for (const op of operations) {
      out.push({
        clientToken: op.clientToken,
        items: await dispatchReadOperation(this, op),
      });
    }
    return out;
  }

  async executeBatchAsync(
    operations: readonly IBatchOperation[],
  ): Promise<readonly IBatchOperationResult[]> {
    const out: IBatchOperationResult[] = [];
    for (const op of operations) {
      const fail = this.failures.get(op.clientToken);
      if (fail) {
        out.push({
          kind: "failure",
          clientToken: op.clientToken,
          status: fail.status,
          body: fail.body,
        });
        continue;
      }
      switch (op.kind) {
        case "insert": {
          const folder =
            op.folderServerRelativeUrl ?? `/sites/dev/${op.list.value}`;
          const rec: Record<string, unknown> = {
            __folder: folder,
            FileDirRef: folder,
          };
          // Validate before taking an id: a rejected insert never created an item.
          const invalid = this.applyFields(rec, op.fields);
          if (invalid) {
            out.push({
              kind: "failure",
              clientToken: op.clientToken,
              status: 400,
              body: invalid,
            });
            break;
          }
          const id = this.nextId(op.list);
          rec.ID = id;
          this.store(op.list).set(id, rec);
          this.bump(op.list, id);
          out.push({
            kind: "success",
            clientToken: op.clientToken,
            serverData: { id },
          });
          break;
        }
        case "update": {
          const m = this.store(op.list);
          const existing = m.get(op.id);
          if (!existing) {
            out.push({
              kind: "failure",
              clientToken: op.clientToken,
              status: 404,
              body: "not found",
            });
            break;
          }
          // Typed update: a `null` value lands as null (a clear), the rest as
          // given — and a person column is checked exactly as on insert.
          const next = { ...existing };
          const invalid = this.applyFields(next, op.fields);
          if (invalid) {
            out.push({
              kind: "failure",
              clientToken: op.clientToken,
              status: 400,
              body: invalid,
            });
            break;
          }
          // Like SharePoint, a FileLeafRef write on a file-backed row renames
          // the file in its folder: FileRef moves with it.
          const currentUrl = existing.FileRef;
          if (
            typeof next.FileLeafRef === "string" &&
            next.FileLeafRef !== existing.FileLeafRef &&
            typeof currentUrl === "string"
          ) {
            const destUrl = `${parentUrlOf(currentUrl)}/${next.FileLeafRef}`;
            next.FileRef = destUrl;
            const files = this.filesByUrl.get(listKey(op.list));
            if (files?.delete(currentUrl)) files.set(destUrl, op.id);
          }
          m.set(op.id, { ...next, ID: op.id });
          this.bump(op.list, op.id);
          out.push({ kind: "success", clientToken: op.clientToken });
          break;
        }
        case "delete": {
          const m = this.store(op.list);
          if (!m.delete(op.id)) {
            out.push({
              kind: "failure",
              clientToken: op.clientToken,
              status: 404,
              body: "not found",
            });
            break;
          }
          this.logDelete(op.list, op.id);
          const log = op.permanent ? this.hardDeleteLog : this.recycleLog;
          const k = listKey(op.list);
          const ids = log.get(k) ?? [];
          ids.push(op.id);
          log.set(k, ids);
          out.push({ kind: "success", clientToken: op.clientToken });
          break;
        }
      }
    }
    return out;
  }
}
