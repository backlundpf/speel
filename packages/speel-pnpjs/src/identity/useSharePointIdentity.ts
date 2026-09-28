// src/identity/useSharePointIdentity.ts
import { spfi } from "@pnp/sp";
import type { SPFI } from "@pnp/sp";
import { SPFx } from "@pnp/sp/behaviors/spfx.js";
import type { ISPFXContext } from "@pnp/sp/behaviors/spfx.js";
import "@pnp/sp/webs/index.js";
import "@pnp/sp/site-users/web.js";
import "@pnp/sp/site-groups/web.js";
import "@pnp/sp/profiles/index.js";
import { SharePointIdentityProvider } from "./SharePointIdentityProvider.js";
import type { IIdentityProvider } from "@speel/identity";

export interface IUseSharePointIdentityOptions {
  spfxContext?: ISPFXContext;
  webUrl?: string;
  spInstance?: SPFI;
}

/**
 * Build a SharePoint-backed IIdentityProvider, mirroring useSharePointSchema.
 *
 * A factory rather than a prototype augmentation of identity's builder: augmenting would need
 * a value import of @speel/identity, making it a hard dependency of every consumer of this
 * package. Pass the result to `initSpeelIdentity(db, (b) => b.useProvider(…))`.
 */
export function useSharePointIdentity(
  arg: ISPFXContext | IUseSharePointIdentityOptions,
): IIdentityProvider {
  const options: IUseSharePointIdentityOptions =
    arg !== null &&
    typeof arg === "object" &&
    ("spfxContext" in arg || "webUrl" in arg || "spInstance" in arg)
      ? (arg as IUseSharePointIdentityOptions)
      : { spfxContext: arg as ISPFXContext };

  if (options.spInstance !== undefined) {
    return new SharePointIdentityProvider(options.spInstance);
  }
  let instance = options.webUrl !== undefined ? spfi(options.webUrl) : spfi();
  if (options.spfxContext) {
    instance = instance.using(SPFx(options.spfxContext));
  }
  return new SharePointIdentityProvider(instance);
}
