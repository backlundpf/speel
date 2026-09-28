// src/Cache/listKey.ts
import type { IListHandle } from "../types.js";
import type { ISourceHandle } from "../providers/ISharePointProvider.js";

/** Stable string key for a list handle, shared by the cache layer. */
export function listKey(list: IListHandle): string {
  return `${list.kind}:${list.value}`;
}

/** Stable string key for any read source; a list's is its listKey. */
export function sourceKey(source: ISourceHandle): string {
  return source.kind === "provider"
    ? `provider:${source.key}`
    : listKey(source);
}
