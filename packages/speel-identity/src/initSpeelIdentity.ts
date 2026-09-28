import type { IdentityDbContext } from "./IdentityDbContext.js";
import { IdentityOptionsBuilder } from "./IdentityOptionsBuilder.js";
import { SpeelIdentity } from "./SpeelIdentity.js";

/**
 * Build the identity surface for a context's site. The `configure` callback receives a fresh
 * `IdentityOptionsBuilder` and must select a provider — e.g.
 * `b.useProvider(useSharePointIdentity(spfxContext))`.
 *
 * Identity is a sibling of the data context rather than part of it: it has different
 * dependencies and a different lifetime, and anything registered on the `DbContext` builder is
 * absent when the migrations CLI constructs a context directly with a stub provider. The
 * context must extend `IdentityDbContext`: that is where the principal sets the managers
 * read are declared.
 */
export function initSpeelIdentity(
  db: IdentityDbContext,
  configure: (builder: IdentityOptionsBuilder) => void,
): SpeelIdentity {
  const builder = new IdentityOptionsBuilder();
  configure(builder);
  return new SpeelIdentity(db, builder.options); // builder.options throws if no provider configured
}
