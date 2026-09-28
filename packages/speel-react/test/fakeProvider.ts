import type { FilterNode, IFileSystem, IStorageProvider } from "@speel/core";

export interface FakeData {
  [listTitle: string]: Record<string, unknown>[];
}

/**
 * One read as the provider received it, flattened for assertions. This is the
 * only honest place to prove a query narrowed AT THE SOURCE: a filter applied
 * to the array after the fetch produces identical rows and identical rendering.
 */
export interface RecordedQuery {
  /** List title, or provider-source key. */
  list: string;
  /** `$top` for this page — what a `take(n)` becomes. */
  top: number;
  fields: readonly string[];
  /** Readable rendering of the filter tree; absent when the read had none. */
  filter?: string;
  /** The filter tree itself, for structural assertions. */
  filterNode?: FilterNode;
  skip?: number;
}

/** The read log makeFakeProvider keeps. */
export interface QueryRecorder {
  /** Every paged read, oldest first. Mutable — a test may clear it before acting. */
  readonly queries: RecordedQuery[];
  /** The most recent paged read; throws when nothing was read. */
  lastQuery(): RecordedQuery;
}

/** Renders a FilterNode as a stable, readable string (e.g. `contains(Title, "lon")`). */
export function describeFilter(node: FilterNode): string {
  switch (node.kind) {
    case "compare":
      return `${node.column} ${node.op} ${JSON.stringify(node.value)}`;
    case "in":
      return `${node.column} ${node.negate ? "notIn" : "in"} ${JSON.stringify(node.values)}`;
    case "is-null":
      return `${node.negate ? "isNotNull" : "isNull"}(${node.column})`;
    case "string":
      return `${node.op}(${node.column}, ${JSON.stringify(node.value)})`;
    case "multichoice":
      return `${node.negate ? "not " : ""}${node.op}(${node.column}${
        node.values ? `, ${JSON.stringify(node.values)}` : ""
      })`;
    case "container-scope":
      return `inFolder(${JSON.stringify(node.path)}${node.recursive ? ", recursive" : ""})`;
    case "include-containers":
      return "includeFolders()";
    case "and":
    case "or":
      return `(${node.children.map(describeFilter).join(` ${node.kind} `)})`;
    case "not":
      return `not(${describeFilter(node.child)})`;
  }
}

/**
 * Evaluates a filter against one row, so an opt-in fake can answer a narrowed
 * read the way a real store does. Case-insensitive on strings, as SharePoint is.
 * A kind it cannot express throws rather than matching everything — silently
 * dropping a predicate is the one thing a store must never do.
 */
export function matchesFilter(
  row: Record<string, unknown>,
  node: FilterNode,
): boolean {
  const cell = (column: string): unknown =>
    column === "Id" || column === "ID" ? (row["ID"] ?? row["Id"]) : row[column];
  const norm = (v: unknown): unknown =>
    typeof v === "string" ? v.toLowerCase() : v;
  const text = (v: unknown): string =>
    v == null ? "" : String(v).toLowerCase();
  switch (node.kind) {
    case "compare": {
      const a = norm(cell(node.column));
      const b = norm(node.value);
      switch (node.op) {
        case "eq":
          return a === b;
        case "ne":
          return a !== b;
        case "gt":
          return (a as number) > (b as number);
        case "ge":
          return (a as number) >= (b as number);
        case "lt":
          return (a as number) < (b as number);
        case "le":
          return (a as number) <= (b as number);
      }
      break;
    }
    case "in": {
      const a = norm(cell(node.column));
      const hit = node.values.some((v) => norm(v) === a);
      return node.negate ? !hit : hit;
    }
    case "is-null": {
      const empty = cell(node.column) == null;
      return node.negate ? !empty : empty;
    }
    case "string": {
      const a = text(cell(node.column));
      const b = text(node.value);
      return node.op === "contains"
        ? a.includes(b)
        : node.op === "startsWith"
          ? a.startsWith(b)
          : a.endsWith(b);
    }
    case "and":
      return node.children.every((c) => matchesFilter(row, c));
    case "or":
      return node.children.some((c) => matchesFilter(row, c));
    case "not":
      return !matchesFilter(row, node.child);
  }
  throw new Error(`fakeProvider: cannot evaluate filter kind '${node.kind}'.`);
}

/**
 * Minimal store with a file system for tests: list items by list title, and
 * provider sources by key — `data.siteGroups`, `data.principals` serve
 * `{ kind: "provider", key }` reads exactly as a list title serves a list.
 * Folders resolve and uploads succeed; the other file-system members are
 * present (so the capability guard sees a whole IFileSystem) but throw.
 */
export function makeFakeProvider(
  data: FakeData,
  opts?: {
    /** Lookup joins applied to `$expand`: navColumn → which list to pull from and the FK to match. */
    joins?: Record<string, { foreignKey: string; targetList: string }>;
    /** Receives every uploadFileAsync call (folder URL + request). */
    uploads?: {
      folderUrl: string | null;
      request: import("@speel/core").IFileUploadRequest;
    }[];
    /** Receives every executeBatchAsync operation. */
    batchOps?: import("@speel/core").IBatchOperation[];
    /**
     * Honour `options.filter` on paged reads (off by default, so the fake stays
     * the dumb row store the existing tests expect). Opt in when the test is
     * about a read that must narrow at the source.
     */
    applyFilter?: boolean;
  },
): IStorageProvider & IFileSystem & QueryRecorder {
  const notImpl = (m: string) => (): never => {
    throw new Error(`fakeProvider: ${m} not implemented`);
  };
  const queries: RecordedQuery[] = [];
  type Source = { kind: "provider"; key: string } | { value: string };
  const keyOf = (source: Source): string =>
    "kind" in source && source.kind === "provider"
      ? source.key
      : (source as { value: string }).value;
  const itemsFor = (key: string) => data[key] ?? [];
  const idOf = (r: Record<string, unknown>): unknown => r["ID"] ?? r["Id"];
  return {
    // DbSet.toArrayAsync calls getItemsPagedAsync(source, fields, pageSize, cursor?, opts?)
    getItemsPagedAsync: async (
      source: Source,
      fields?: readonly string[],
      pageSize?: number,
      _cursor?: unknown,
      options?: {
        expand?: { navColumn: string }[];
        filter?: FilterNode;
        skip?: number;
      },
    ) => {
      queries.push({
        list: keyOf(source),
        top: pageSize ?? 0,
        fields: fields ?? [],
        ...(options?.filter !== undefined
          ? {
              filter: describeFilter(options.filter),
              filterNode: options.filter,
            }
          : {}),
        ...(options?.skip !== undefined ? { skip: options.skip } : {}),
      });
      let items = itemsFor(keyOf(source));
      if (opts?.applyFilter && options?.filter) {
        const filter = options.filter;
        items = items.filter((r) => matchesFilter(r, filter));
      }
      const joins = opts?.joins;
      if (options?.expand && joins) {
        items = items.map((item) => {
          const row = { ...item };
          for (const ex of options.expand!) {
            const j = joins[ex.navColumn];
            if (!j) continue;
            const fk = item[j.foreignKey];
            const targets = itemsFor(j.targetList);
            row[ex.navColumn] = Array.isArray(fk)
              ? targets.filter((r) => (fk as unknown[]).includes(idOf(r)))
              : (targets.find((r) => idOf(r) === fk) ?? null);
          }
          return row;
        });
      }
      return { items, nextCursor: null };
    },
    countAsync: async (source: Source) => itemsFor(keyOf(source)).length,
    getItemByIdAsync: async (source: Source, id: number) =>
      itemsFor(keyOf(source)).find((r) => idOf(r) === id) ?? null,
    getItemsByIdsAsync: async (source: Source, ids: readonly number[]) =>
      ids.map(
        (id) => itemsFor(keyOf(source)).find((r) => idOf(r) === id) ?? null,
      ),
    executeBatchAsync: async (
      operations: readonly import("@speel/core").IBatchOperation[],
    ) => {
      let nextId = 500;
      return operations.map((op) => {
        opts?.batchOps?.push(op);
        if (op.kind === "insert") {
          return {
            kind: "success" as const,
            clientToken: op.clientToken,
            serverData: { id: nextId++ },
          };
        }
        return { kind: "success" as const, clientToken: op.clientToken };
      });
    },
    ensureFoldersAsync: async (
      list: { value: string },
      paths: readonly string[],
    ) => new Map(paths.map((p) => [p, `/sites/dev/${list.value}/${p}`])),
    uploadFileAsync: async (
      list: { value: string },
      folderServerRelativeUrl: string | null,
      request: import("@speel/core").IFileUploadRequest,
    ) => {
      opts?.uploads?.push({ folderUrl: folderServerRelativeUrl, request });
      request.onProgress?.({ bytesUploaded: 1, bytesTotal: 1 });
      const base = folderServerRelativeUrl ?? `/sites/dev/${list.value}`;
      return {
        id: 901,
        fileName: request.fileName,
        serverRelativeUrl: `${base}/${request.fileName}`,
      };
    },
    renameFileAsync: notImpl("renameFileAsync"),
    copyFileAsync: notImpl("copyFileAsync"),
    renameFolderAsync: notImpl("renameFolderAsync"),
    deleteFolderAsync: notImpl("deleteFolderAsync"),
    checkinFileAsync: notImpl("checkinFileAsync"),
    queries,
    lastQuery: (): RecordedQuery => {
      const last = queries[queries.length - 1];
      if (!last) throw new Error("fakeProvider: no paged read was recorded.");
      return last;
    },
  } as unknown as IStorageProvider & IFileSystem & QueryRecorder;
}
