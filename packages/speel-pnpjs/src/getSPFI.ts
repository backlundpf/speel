// src/getSPFI.ts
import type { DbContext } from "@speel/core";
import type { SPFI } from "@pnp/sp";
import { SharePointProvider } from "./SharePointProvider.js";

/**
 * Typed escape hatch — EF's `Database.GetDbConnection()` analog. Returns the
 * configured @pnp/sp SPFI behind a SharePoint-backed context for queries the
 * @speel surface doesn't cover.
 */
export function getSPFI(context: DbContext): SPFI {
  const provider = context.provider;
  if (!(provider instanceof SharePointProvider)) {
    throw new Error(
      "getSPFI: this DbContext is not backed by a SharePointProvider.",
    );
  }
  return provider.sp;
}
