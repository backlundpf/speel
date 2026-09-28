import type { EntityCtor, IEntity, IListHandle } from "../types.js";
import type {
  IProviderSource,
  ISourceHandle,
} from "../providers/ISharePointProvider.js";
import {
  ModelConfigurationException,
  InvalidOperationException,
} from "../errors.js";
import { Property } from "./Property.js";
import type { INavigation } from "./Navigation.js";
import type { ValidationRule } from "./Validation.js";
import type { ICacheConfig } from "../ModelBuilder/CacheConfigBuilder.js";

export type ListTemplate = "genericList" | "documentLibrary";

/** How much of a list a user may see or change: everything, or only their own items. */
export type ItemSecurity = "all" | "own";

export interface IListProvisioning {
  template?: ListTemplate;
  url?: string;
  description?: string;
  onQuickLaunch?: boolean;
  /**
   * Item-level security. `'own'` restricts a user to the items they created, enforced by
   * SharePoint rather than by every query that ever touches the list — so a client bug cannot
   * read or overwrite another user's rows, and no current-user filter has to be remembered.
   *
   * Applied at list CREATION only: there is no `updateList` operation in the migration
   * vocabulary, the same limitation `description` and `onQuickLaunch` already carry.
   */
  readSecurity?: ItemSecurity;
  writeSecurity?: ItemSecurity;
}

/**
 * Where an entity's rows come from: a SharePoint list, or a collection the provider
 * serves under a key (`principals`, `siteUsers`, `siteGroups` on the pnpjs provider).
 * A list is one kind of provider source — `toList` is shorthand for it.
 *
 * `embedded` is the exception that has no rows at all: a shape that lives inside a
 * column (see JsonField). It exists so a complex value can be declared with the same
 * decorators and rendered by the same forms as an entity.
 */
export type EntitySource =
  | { kind: "list"; list: IListHandle; provisioning?: IListProvisioning }
  | { kind: "embedded" }
  | IProviderSource;

export interface IEntityTypeInit<T extends IEntity> {
  ctor: EntityCtor<T>;
  /** Provide exactly one of `source` or `list` (list is sugar for a list source). */
  source?: EntitySource;
  list?: IListHandle;
  properties: ReadonlyArray<Property>;
  validations?: readonly ValidationRule[];
  cache?: ICacheConfig;
}

export class EntityType<T extends IEntity = IEntity> {
  public readonly ctor: EntityCtor<T>;
  public readonly source: EntitySource;
  public readonly properties: ReadonlyArray<Property>;
  public readonly validations: readonly ValidationRule[];
  public readonly cache?: ICacheConfig;
  public readonly columnNames: ReadonlyArray<string>;

  private readonly _key: Property | undefined;
  private readonly byPropertyName: ReadonlyMap<string, Property>;
  private readonly byColumnName: ReadonlyMap<string, Property>;
  private readonly _navigations: INavigation[] = [];
  private readonly byNavName = new Map<string, INavigation>();

  constructor(init: IEntityTypeInit<T>) {
    this.ctor = init.ctor;
    if (init.source && init.list) {
      throw new ModelConfigurationException(
        `Entity ${init.ctor.name}: provide source or list, not both.`,
      );
    }
    if (init.source) {
      this.source = init.source;
    } else if (init.list) {
      this.source = { kind: "list", list: init.list };
    } else {
      throw new ModelConfigurationException(
        `Entity ${init.ctor.name} requires a source (list or provider).`,
      );
    }
    this.properties = Object.freeze([...init.properties]);
    this.validations = Object.freeze(
      init.validations ? [...init.validations] : [],
    );
    if (init.cache !== undefined) this.cache = init.cache;

    const keys = this.properties.filter((p) => p.key);
    if (this.source.kind === "embedded") {
      if (keys.length > 0) {
        throw new ModelConfigurationException(
          `Shape ${init.ctor.name} cannot have a key property: it is embedded in a column, not a row.`,
        );
      }
      this._key = undefined;
    } else {
      if (keys.length !== 1) {
        throw new ModelConfigurationException(
          `Entity ${init.ctor.name} must have exactly one key property (found ${keys.length}).`,
        );
      }
      this._key = keys[0]!;
    }

    this.byPropertyName = new Map(
      this.properties.map((p) => [p.propertyName, p]),
    );
    this.byColumnName = new Map(this.properties.map((p) => [p.columnName, p]));
    this.columnNames = Object.freeze(this.properties.map((p) => p.columnName));
  }

  /** The handle every read passes the provider: the list, or the provider source itself. */
  get sourceHandle(): ISourceHandle {
    if (this.source.kind === "list") {
      return this.source.list;
    }
    if (this.source.kind === "embedded") {
      throw new InvalidOperationException(
        `Shape ${this.ctor.name} has no source handle: it is embedded in a column, not a row.`,
      );
    }
    return this.source;
  }

  /** True for a shape: a type that lives inside a column rather than owning rows. */
  get isEmbedded(): boolean {
    return this.source.kind === "embedded";
  }

  /**
   * The key property. Throws for an embedded type — which is exactly what the
   * tracking, save and cache paths want: a shape has no identity of its own, and
   * reaching for one is a bug worth hearing about. The model is not
   * misconfigured (a shape legitimately has no key); the caller asked a
   * row-shaped question of something that is not a row, so this reads the same
   * way `list` and `sourceHandle` do.
   */
  get key(): Property {
    if (this._key === undefined) {
      throw new InvalidOperationException(
        `Shape ${this.ctor.name} has no key: it is embedded in a column, not a row.`,
      );
    }
    return this._key;
  }

  /**
   * The backing list. Throws for a provider source — which is exactly what the write,
   * folder, file and cache paths want: a provider source is read-only through the
   * entity API and not cacheable.
   */
  get list(): IListHandle {
    if (this.source.kind !== "list") {
      const sourceDesc =
        this.source.kind === "embedded"
          ? "embedded in a column"
          : `provider '${this.source.key}'`;
      throw new InvalidOperationException(
        `Entity ${this.ctor.name} is not list-backed (source: ${sourceDesc}).`,
      );
    }
    return this.source.list;
  }

  /** List-provisioning metadata, or undefined for a provider source / an unspecified list. */
  get listProvisioning(): IListProvisioning | undefined {
    return this.source.kind === "list" ? this.source.provisioning : undefined;
  }

  findProperty(propertyName: string): Property | undefined {
    return this.byPropertyName.get(propertyName);
  }

  findByColumnName(columnName: string): Property | undefined {
    return this.byColumnName.get(columnName);
  }

  /** @internal */
  addNavigation(nav: INavigation): void {
    if (this.byNavName.has(nav.name)) {
      throw new Error(
        `Navigation '${nav.name}' already registered on ${this.ctor.name}.`,
      );
    }
    this._navigations.push(nav);
    this.byNavName.set(nav.name, nav);
  }

  findNavigation(name: string): INavigation | undefined {
    return this.byNavName.get(name);
  }

  navigations(): readonly INavigation[] {
    return this._navigations;
  }
}
