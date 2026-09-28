// src/listUrl.ts
import type { DbContext, EntityCtor, IEntity } from "@speel/core";
import { SharePointProvider } from "./SharePointProvider.js";

/**
 * The server-relative URL of the list behind `entity` — e.g.
 * `/sites/projects/Lists/ProjectTasks`.
 *
 * Reach for this any time a URL has to point INTO SharePoint rather than through
 * the @speel surface: a link, an iframe, a view. Composing one from the web URL
 * and the list title is the obvious alternative and it is wrong — a list's URL
 * comes from its internal name at creation, a rename changes the title and leaves
 * the URL untouched, and libraries have no `/Lists/` segment at all.
 *
 * Cheap to call repeatedly: the provider memoizes the underlying read per list.
 */
export async function listUrlAsync<T extends IEntity>(
  context: DbContext,
  entity: EntityCtor<T>,
): Promise<string> {
  const provider = context.provider;
  if (!(provider instanceof SharePointProvider)) {
    throw new Error(
      "listUrlAsync: this DbContext is not backed by a SharePointProvider.",
    );
  }
  const entityType = context.model.findEntityType(entity);
  if (!entityType) {
    throw new Error(
      `listUrlAsync: ${entity.name} is not part of this context's model.`,
    );
  }
  return provider.resolveListRootUrl(entityType.list);
}
