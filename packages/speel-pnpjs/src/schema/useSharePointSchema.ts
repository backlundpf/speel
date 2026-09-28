// src/schema/useSharePointSchema.ts
import { spfi } from "@pnp/sp";
import type { SPFI } from "@pnp/sp";
import { SPFx } from "@pnp/sp/behaviors/spfx.js";
import type { ISPFXContext } from "@pnp/sp/behaviors/spfx.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/fields/index.js";
import { SharePointSchemaProvider } from "./SharePointSchemaProvider.js";
import type { ISchemaProvider } from "@speel/migrations";

export interface IUseSharePointSchemaOptions {
  spfxContext?: ISPFXContext;
  webUrl?: string;
  spInstance?: SPFI;
}

/** Build a SharePoint-backed ISchemaProvider, mirroring useSharePoint. */
export function useSharePointSchema(
  arg: ISPFXContext | IUseSharePointSchemaOptions,
): ISchemaProvider {
  const options: IUseSharePointSchemaOptions =
    arg !== null &&
    typeof arg === "object" &&
    ("spfxContext" in arg || "webUrl" in arg || "spInstance" in arg)
      ? (arg as IUseSharePointSchemaOptions)
      : { spfxContext: arg as ISPFXContext };

  if (options.spInstance !== undefined) {
    return new SharePointSchemaProvider(options.spInstance);
  }
  let instance = options.webUrl !== undefined ? spfi(options.webUrl) : spfi();
  if (options.spfxContext) {
    instance = instance.using(SPFx(options.spfxContext));
  }
  return new SharePointSchemaProvider(instance);
}
