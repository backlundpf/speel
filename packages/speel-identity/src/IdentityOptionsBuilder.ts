import { InvalidOperationException } from "@speel/core";
import type { IIdentityProvider } from "./IIdentityProvider.js";
import { PolicyBuilder, type Policy } from "./PolicyBuilder.js";
import type { UserSettingsStore } from "./userSettingsStore.js";

/** Result of `IdentityOptionsBuilder.options` — immutable. */
export interface IIdentityOptions {
  readonly provider: IIdentityProvider;
  readonly policies: ReadonlyMap<string, Policy>;
  /** Absent means the default: the `UserSetting` list on an `IdentityDbContext`. */
  readonly settings?: UserSettingsStore;
}

/**
 * How identity is configured: the provider that talks to the platform, the named policies the
 * app will ask by name, and optionally where settings live.
 */
export class IdentityOptionsBuilder {
  #provider: IIdentityProvider | undefined;
  #settings: UserSettingsStore | undefined;
  readonly #policies = new Map<string, Policy>();

  useProvider(provider: IIdentityProvider): this {
    this.#provider = provider;
    return this;
  }

  /**
   * Name a question here, ask it by name everywhere else. Re-registering a name replaces it,
   * so a host can override a policy a shared module declared.
   */
  addPolicy(name: string, build: (policy: PolicyBuilder) => void): this {
    const builder = new PolicyBuilder();
    build(builder);
    this.#policies.set(name, builder.build(name));
    return this;
  }

  /**
   * Put settings somewhere other than the `UserSetting` list — `createLocalUserSettingsStore()`
   * for a per-browser app or a test, or anything else implementing the contract. Without this
   * the default needs a context extending `IdentityDbContext`.
   */
  useSettings(store: UserSettingsStore): this {
    this.#settings = store;
    return this;
  }

  get options(): IIdentityOptions {
    if (!this.#provider) {
      throw new InvalidOperationException(
        "No identity provider configured. Call useProvider(useSharePointIdentity(spfxContext)).",
      );
    }
    return Object.freeze({
      provider: this.#provider,
      policies: new Map(this.#policies),
      ...(this.#settings !== undefined ? { settings: this.#settings } : {}),
    });
  }
}
