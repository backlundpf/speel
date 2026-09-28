// src/ISharePointHost.ts
//
// The seam between SharePointProvider and the capability classes that stand
// behind its IFileSystem and IChangeFeed members. The provider passes `this`;
// the classes reach the SPFI and the provider's shared machinery only through
// this interface, never through the provider type itself.
import type { SPFI } from "@pnp/sp";
import type { IList } from "@pnp/sp/lists/index.js";
import type { IExpandClause, IListHandle, IWriteField } from "@speel/core";

/** What the capability classes need from the provider: the SPFI, list resolution, the shared root-URL cache, claims resolution, and select/expand assembly. */
export interface ISharePointHost {
  readonly sp: SPFI;
  list(handle: IListHandle): IList;
  resolveListRootUrl(list: IListHandle): Promise<string>;
  loginsFor(
    fields: readonly IWriteField[],
  ): Promise<(id: number) => string | undefined>;
  selectAndExpand(
    fields: readonly string[],
    expand: readonly IExpandClause[] | undefined,
  ): { selects: string[]; expands: string[] };
}
