// src/UseSharePoint.ts
import { spfi } from "@pnp/sp";
import type { SPFI } from "@pnp/sp";
import { SPFx } from "@pnp/sp/behaviors/spfx.js";
import type { ISPFXContext } from "@pnp/sp/behaviors/spfx.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/lists/index.js";
import "@pnp/sp/items/index.js";
import "@pnp/sp/batching.js";
import "@pnp/sp/folders/index.js";
import "@pnp/sp/security/index.js";
import "@pnp/sp/site-users/index.js";
import "@pnp/sp/site-groups/index.js";
import { DbContextOptionsBuilder } from "@speel/core";
import { SharePointProvider } from "./SharePointProvider.js";

export interface IUseSharePointOptions {
  /** SPFx WebPartContext or ApplicationCustomizerContext. */
  spfxContext?: ISPFXContext;
  /** Override the web URL (defaults to spfxContext's web). */
  webUrl?: string;
  /** Advanced: pass a fully configured @pnp/sp SPFI instance. */
  spInstance?: SPFI;
}

declare module "@speel/core" {
  interface DbContextOptionsBuilder {
    useSharePoint(spfxContext: ISPFXContext): DbContextOptionsBuilder;
    useSharePoint(options: IUseSharePointOptions): DbContextOptionsBuilder;
  }
}

DbContextOptionsBuilder.prototype.useSharePoint = function (
  this: DbContextOptionsBuilder,
  arg: ISPFXContext | IUseSharePointOptions,
): DbContextOptionsBuilder {
  const options: IUseSharePointOptions =
    arg !== null &&
    typeof arg === "object" &&
    ("spfxContext" in arg || "webUrl" in arg || "spInstance" in arg)
      ? (arg as IUseSharePointOptions)
      : { spfxContext: arg as ISPFXContext };

  const sp = options.spInstance ?? buildSpFromOptions(options);
  return this.useProvider(new SharePointProvider(sp));
};

function buildSpFromOptions(options: IUseSharePointOptions): SPFI {
  // The selector imports above register the PnPjs behaviours; SPFx comes from
  // its dedicated behaviors module (NOT presets/all, which would pull the
  // entire @pnp/sp surface into consumer bundles).
  let instance = options.webUrl !== undefined ? spfi(options.webUrl) : spfi();
  if (options.spfxContext) {
    instance = instance.using(SPFx(options.spfxContext));
  }
  return instance;
}
