// src/initSpeelDbContext.ts
import type { IDbContextOptions } from "./types.js";
import type { DbContext } from "./DbContext.js";
import { DbContextOptionsBuilder } from "./DbContextOptionsBuilder.js";

/**
 * Build and construct a DbContext subclass. The `configure` callback receives a
 * fresh DbContextOptionsBuilder and must select a provider (e.g. b.useSharePoint(ctx)
 * or b.useProvider(p)). Options are validated before the context is constructed.
 */
export function initSpeelDbContext<T extends DbContext>(
  Ctx: new (options: IDbContextOptions) => T,
  configure: (builder: DbContextOptionsBuilder) => void,
): T {
  const builder = new DbContextOptionsBuilder();
  configure(builder);
  return new Ctx(builder.options); // builder.options throws if no provider configured
}
