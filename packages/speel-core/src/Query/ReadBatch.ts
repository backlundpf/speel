// src/Query/ReadBatch.ts
import type {
  IStorageProvider,
  IReadOperation,
} from "../providers/ISharePointProvider.js";
import { sourceKey } from "../Cache/listKey.js";

/**
 * Perform ONE read descriptor through the provider's individual read methods,
 * draining every page. This is both the no-capability fallback and the natural
 * implementation of executeReadBatchAsync for providers with no real batching
 * (the test fake). Missing records are dropped: apply-side grouping keys off each
 * record's own Id, so a positional null carries no information.
 */
export async function dispatchReadOperation(
  provider: IStorageProvider,
  op: IReadOperation,
): Promise<readonly Record<string, unknown>[]> {
  if (op.kind === "itemsByIds") {
    const results = await provider.getItemsByIdsAsync(
      op.source,
      op.ids,
      op.fields,
      {
        ...(op.expand ? { expand: op.expand } : {}),
        ...(op.properties ? { properties: op.properties } : {}),
      },
    );
    return results.filter((r): r is Record<string, unknown> => r !== null);
  }
  const out: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await provider.getItemsPagedAsync(
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

/**
 * Union-merge a level's id-based reads so the batch asks each target once. Two
 * navigations resolving against the same source (a list, or a provider source)
 * with the same fields plan separate itemsByIds ops, usually over overlapping ids;
 * the merged op carries the ids' union under the FIRST op's clientToken, and `remap`
 * points every absorbed token at the surviving one. Safe because the apply side keys
 * records by their own Id and ignores ones its parents never referenced.
 *
 * Filter-based `items` ops pass through untouched: their in-filter chunks are
 * provider-budgeted per navigation, and re-chunking a merged filter is not worth the
 * arithmetic for a shape that only duplicates when two navigations are identical.
 */
export function dedupeReadOperations(operations: readonly IReadOperation[]): {
  ops: readonly IReadOperation[];
  remap: ReadonlyMap<string, string>;
} {
  const ops: IReadOperation[] = [];
  const remap = new Map<string, string>();
  const byKey = new Map<string, { index: number; ids: number[] }>();

  for (const op of operations) {
    if (op.kind === "items") {
      ops.push(op);
      continue;
    }
    // Expand clauses are keyed by nav and fields, never serialised whole: a
    // clause carries Property objects whose target EntityTypes are cyclic.
    const expandKey = (op.expand ?? [])
      .map((e) => `${e.navColumn}:${e.selectFields.join("+")}`)
      .join(";");
    const key = `i|${sourceKey(op.source)}|${op.fields.join(",")}|${expandKey}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { index: ops.length, ids: [...op.ids] });
      ops.push(op);
      continue;
    }
    const survivor = ops[existing.index]! as Extract<
      IReadOperation,
      { ids: readonly number[] }
    >;
    const seen = new Set(existing.ids);
    for (const id of op.ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      existing.ids.push(id);
    }
    ops[existing.index] = { ...survivor, ids: existing.ids };
    remap.set(op.clientToken, survivor.clientToken);
  }
  return { ops, remap };
}

/** Tag an error with the operation it came from, without overwriting an existing tag. */
function attribute(err: unknown, clientToken: string): unknown {
  if (err !== null && typeof err === "object" && !("clientToken" in err)) {
    (err as { clientToken?: string }).clientToken = clientToken;
  }
  return err;
}

/**
 * Execute one level's reads, returning each operation's records keyed by clientToken.
 *
 * Uses executeReadBatchAsync when the provider offers it (one round-trip where the
 * backend supports it); otherwise runs the same descriptors through the individual
 * read methods concurrently — same results, more round-trips. An empty operation list
 * touches the provider not at all.
 *
 * A failure rejects the whole level: there is no meaningful partial include. Where the
 * failing operation is knowable, the rejected error carries `clientToken` so the caller
 * can name the navigation behind it.
 */
export async function runReadBatch(
  provider: IStorageProvider,
  operations: readonly IReadOperation[],
): Promise<Map<string, readonly Record<string, unknown>[]>> {
  const byToken = new Map<string, readonly Record<string, unknown>[]>();
  if (operations.length === 0) return byToken;

  if (provider.executeReadBatchAsync) {
    const results = await provider.executeReadBatchAsync(operations);
    for (const r of results) byToken.set(r.clientToken, r.items);
    return byToken;
  }

  const settled = await Promise.all(
    operations.map(async (op) => {
      try {
        return {
          clientToken: op.clientToken,
          items: await dispatchReadOperation(provider, op),
        };
      } catch (err) {
        throw attribute(err, op.clientToken);
      }
    }),
  );
  for (const r of settled) byToken.set(r.clientToken, r.items);
  return byToken;
}
