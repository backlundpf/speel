// src/ModelBuilder/CacheConfigBuilder.ts
import type { IEntity } from "../types.js";
import { ModelConfigurationException } from "../errors.js";
import { captureSelectorName } from "../Metadata/selectorName.js";

/** One expand on the cached shape; fields are resolved later against the model. */
export interface ICacheExpandSpec {
  navName: string;
  fields?: readonly string[];
}

/** Built cache configuration attached to an EntityType. */
export interface ICacheConfig {
  timeout?: number;
  expands: ICacheExpandSpec[];
}

function captureName<T>(selector: (e: T) => unknown): string {
  return captureSelectorName(
    selector as (e: never) => unknown,
    (m) => new ModelConfigurationException(m),
    "Cache expand selector did not access any property.",
  );
}

export class CacheConfigBuilder<T extends IEntity> {
  private timeoutMs: number | undefined;
  private readonly expands: ICacheExpandSpec[] = [];

  constructor(opts?: ICacheConfig) {
    if (opts?.timeout) this.timeoutMs = opts.timeout;
    if (opts?.expands) this.expands = opts.expands;
  }

  /** Minimum interval (ms) between delta syncs. Omitted → sync every call. */
  withTimeout(ms: number): this {
    this.timeoutMs = ms;
    return this;
  }

  /** Shape the cached payload by expanding a navigation. No select() — deferred. */
  expand(selector: (e: T) => unknown, fields?: readonly string[]): this {
    const navName = captureName(selector);
    this.expands.push(
      fields && fields.length > 0 ? { navName, fields } : { navName },
    );
    return this;
  }

  /** @internal */
  build(): ICacheConfig {
    return this.timeoutMs === undefined
      ? { expands: [...this.expands] }
      : { timeout: this.timeoutMs, expands: [...this.expands] };
  }
}
