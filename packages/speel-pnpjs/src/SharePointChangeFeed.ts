// src/SharePointChangeFeed.ts
//
// The IChangeFeed half of the PnPjs provider: GetListItemChangesSinceToken and
// the Modified-ge delta read that follows it. SharePointProvider delegates its
// IChangeFeed member here and hands over an ISharePointHost for list resolution
// and select/expand assembly.
import type { IList } from "@pnp/sp/lists/index.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import type {
  IChangeFeed,
  IExpandClause,
  IListHandle,
  Property,
} from "@speel/core";
import { tokenToIso } from "@speel/core";
import { parseDeletedIds, parseLastChangeToken } from "./changeParse.js";
import { coerceRecords } from "./readValues.js";
import type { ISharePointHost } from "./ISharePointHost.js";

export class SharePointChangeFeed implements IChangeFeed {
  constructor(private readonly host: ISharePointHost) {}

  async getListItemChangesSinceToken(
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
    const { selects, expands } = this.host.selectAndExpand(fields, expand);

    // The change feed yields the new change token (its advancing LastChangeToken)
    // and, on a delta, the deleted item Ids. On first load (empty token) we omit
    // ChangeToken to read the current token cheaply (RowLimit 1, ID-only).
    // Every member of this query is a primitive string — passing objects/numbers
    // yields a 400 ("a 'PrimitiveValue' node was expected") from SharePoint.
    const xml: string = await this.host
      .list(list)
      .getListItemChangesSinceToken({
        ...(token !== "" ? { ChangeToken: token } : {}),
        ViewFields: '<ViewFields><FieldRef Name="ID" /></ViewFields>',
        RowLimit: token !== "" ? "5000" : "1",
      } as Parameters<IList["getListItemChangesSinceToken"]>[0]);
    const newToken: string = parseLastChangeToken(xml) ?? token;
    const deletedIds = token === "" ? [] : parseDeletedIds(xml);

    // The token only advances when the list changes. On a delta where it hasn't
    // moved, nothing was added/changed/deleted — skip the Modified-ge query.
    // First load (empty token) always fetches everything.
    const changed: Record<string, unknown>[] = [];
    if (token === "" || newToken !== token) {
      let q = this.host.list(list).items.select(...selects);
      if (expands.length) q = q.expand(...expands);
      if (token !== "") {
        const iso = tokenToIso(token);
        // SharePoint REST datetime filter form; some tenants require datetime'<iso>'.
        if (iso) q = q.filter(`Modified ge '${iso}'`);
      }
      for await (const page of q.top(5000) as AsyncIterable<
        Record<string, unknown>[]
      >) {
        changed.push(...coerceRecords(page, properties, expand));
      }
    }
    return { changed, deletedIds, newToken };
  }
}
