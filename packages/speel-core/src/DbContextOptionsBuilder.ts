// src/DbContextOptionsBuilder.ts
import type { IDbContextOptions } from "./types.js";
import type { IStorageProvider } from "./providers/ISharePointProvider.js";
import type { ICacheProvider } from "./Cache/ICacheProvider.js";
import { InvalidOperationException } from "./errors.js";

export class DbContextOptionsBuilder {
  private provider: IStorageProvider | undefined;
  private cache: ICacheProvider | undefined;

  /** @internal — providers call this from declaration-merged extensions (e.g., useSharePoint). */
  useProvider(provider: IStorageProvider): this {
    this.provider = provider;
    return this;
  }

  /** Register a cache provider, enabling cacheAsync() on cached entities. */
  useCaching(provider: ICacheProvider): this {
    this.cache = provider;
    return this;
  }

  get options(): IDbContextOptions {
    if (!this.provider) {
      throw new InvalidOperationException(
        "No provider configured. Call useSharePoint(...) or useProvider(...).",
      );
    }
    return Object.freeze(
      this.cache !== undefined
        ? { provider: this.provider, cache: this.cache }
        : { provider: this.provider },
    );
  }
}
