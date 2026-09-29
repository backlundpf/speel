import type {
  IStorageProvider,
  IBatchOperation,
  IBatchOperationResult,
  IWriteField,
} from "@speel/core";

/** Typed fields → the columns they land in; this fake stores them as given. */
function columnsOf(fields: readonly IWriteField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => [f.property.columnName, f.value]),
  );
}

/**
 * In-memory IStorageProvider supporting paged reads + insert/update/delete
 * batches, keyed by list title. A plain store: no file system, no change feed.
 */
export function makeFakeDataProvider(
  seed: Record<string, Record<string, unknown>[]> = {},
): IStorageProvider {
  const store: Record<string, Record<string, unknown>[]> = {};
  for (const [k, v] of Object.entries(seed))
    store[k] = v.map((r) => ({ ...r }));
  let nextId = 1000;
  const itemsFor = (title: string) => (store[title] ??= []);
  const notImpl = (m: string) => (): never => {
    throw new Error(`fakeDataProvider: ${m} not implemented`);
  };

  return {
    getItemsPagedAsync: async (list: { value: string }) => ({
      items: itemsFor(list.value),
      nextCursor: null,
    }),
    countAsync: async (list: { value: string }) => itemsFor(list.value).length,
    executeBatchAsync: async (
      ops: readonly IBatchOperation[],
    ): Promise<IBatchOperationResult[]> =>
      ops.map((op): IBatchOperationResult => {
        const title = (op.list as { value: string }).value;
        if (op.kind === "insert") {
          const id = ++nextId;
          itemsFor(title).push({ ID: id, Id: id, ...columnsOf(op.fields) });
          return {
            kind: "success",
            clientToken: op.clientToken,
            serverData: { id },
          };
        }
        if (op.kind === "update") {
          const row = itemsFor(title).find(
            (r) => (r["ID"] ?? r["Id"]) === op.id,
          );
          if (row) Object.assign(row, columnsOf(op.fields ?? []));
          return {
            kind: "success",
            clientToken: op.clientToken,
            serverData: { id: op.id },
          };
        }
        if (op.kind === "delete") {
          store[title] = itemsFor(title).filter(
            (r) => (r["ID"] ?? r["Id"]) !== op.id,
          );
          return {
            kind: "success",
            clientToken: op.clientToken,
            serverData: { id: op.id },
          };
        }
        const unhandled: never = op;
        throw new Error(`fakeDataProvider: unhandled op ${String(unhandled)}`);
      }),
    getItemByIdAsync: notImpl("getItemByIdAsync"),
    getItemsByIdsAsync: notImpl("getItemsByIdsAsync"),
  } as unknown as IStorageProvider;
}
