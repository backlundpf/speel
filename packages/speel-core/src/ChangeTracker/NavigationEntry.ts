import type { IEntity } from "../types.js";
import type { INavigation } from "../Metadata/Navigation.js";
import type { EntityEntry } from "./EntityEntry.js";

export interface ILoadOptions {
  force?: boolean;
}

/** Shared behavior: a thin accessor over one navigation of a tracked entity. */
abstract class NavigationEntryBase<T extends IEntity> {
  constructor(
    protected readonly entry: EntityEntry<T>,
    protected readonly nav: INavigation,
  ) {}

  get isLoaded(): boolean {
    return this.entry.isNavLoaded(this.nav.name);
  }

  async loadAsync(options?: ILoadOptions): Promise<void> {
    await this.entry.loadNavAsync(this.nav, options?.force === true);
  }

  protected get rawValue(): unknown {
    return (this.entry.entity as unknown as Record<string, unknown>)[
      this.nav.name
    ];
  }
}

export class ReferenceEntry<
  TTarget = IEntity,
  T extends IEntity = IEntity,
> extends NavigationEntryBase<T> {
  /** Live read of the navigation on the entity — never a cached copy. */
  get currentValue(): TTarget | undefined {
    return (this.rawValue ?? undefined) as TTarget | undefined;
  }
}

export class CollectionEntry<
  TTarget = IEntity,
  T extends IEntity = IEntity,
> extends NavigationEntryBase<T> {
  /** Live read of the navigation on the entity; [] when unset. */
  get currentValue(): TTarget[] {
    const v = this.rawValue;
    return (Array.isArray(v) ? v : []) as TTarget[];
  }
}
