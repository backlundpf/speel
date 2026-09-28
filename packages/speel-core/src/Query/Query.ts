// src/Query/Query.ts
import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type { FilterNode } from "./FilterNode.js";
import {
  createFilterBuilder,
  type FilterBuilder,
  PropertyFilter,
} from "./FilterBuilder.js";
import { QueryExecutor, type IQueryState } from "./QueryExecutor.js";
import { and } from "./FilterNode.js";
import { InvalidOperationException } from "../errors.js";
import type { IQuery, NavTarget } from "./IQuery.js";
import type { IIncludeNode, IExpandSpec } from "./IncludeNode.js";
import { resolveExpandFields } from "./expandResolution.js";
import { captureSelectorName } from "../Metadata/selectorName.js";

export class Query<T extends IEntity> implements IQuery<T> {
  constructor(
    public readonly state: IQueryState<T>,
    protected readonly executor: QueryExecutor<T>,
  ) {}

  static empty<T extends IEntity>(
    et: EntityType<T>,
    executor: QueryExecutor<T>,
  ): Query<T> {
    return new Query<T>(
      {
        entityType: et,
        orderBy: [],
        noTracking: false,
        includes: [],
        expands: [],
      },
      executor,
    );
  }

  private withState(patch: Partial<IQueryState<T>>): Query<T> {
    return new Query<T>({ ...this.state, ...patch }, this.executor);
  }

  where(predicate: (b: FilterBuilder<T>) => FilterNode): Query<T> {
    const builder = createFilterBuilder(this.state.entityType);
    const node = predicate(builder);
    const newFilter = this.state.filter ? and(this.state.filter, node) : node;
    return this.withState({ filter: newFilter });
  }

  orderBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction: "asc" | "desc" = "asc",
  ): Query<T> {
    const column = this.extractColumn(selector);
    return this.withState({ orderBy: [{ column, direction }] });
  }

  thenBy<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
    direction: "asc" | "desc" = "asc",
  ): Query<T> {
    if (this.state.orderBy.length === 0) {
      throw new InvalidOperationException(
        `thenBy() called before orderBy() on entity ${this.state.entityType.ctor.name}.`,
      );
    }
    const column = this.extractColumn(selector);
    return this.withState({
      orderBy: [...this.state.orderBy, { column, direction }],
    });
  }

  private extractColumn<K extends keyof T>(
    selector: (b: FilterBuilder<T>) => FilterBuilder<T>[K],
  ): string {
    const builder = createFilterBuilder(this.state.entityType);
    const result = selector(builder) as unknown as PropertyFilter;
    return result._property.columnName;
  }

  take(n: number): Query<T> {
    return this.withState({ take: n });
  }

  skip(n: number): Query<T> {
    return this.withState({ skip: n });
  }

  asNoTracking(): Query<T> {
    return this.withState({ noTracking: true });
  }

  expand(selector: (e: T) => unknown, fields?: readonly string[]): Query<T> {
    const navName = captureSelectorName(selector as (e: never) => unknown);
    const special = this.executor.findSpecialExpand(navName);
    if (special) {
      // Model-registered special expandable: the handler owns the whole clause.
      if (this.state.expands.some((e) => e.navName === navName)) return this;
      return this.withState({
        expands: [...this.state.expands, special.spec()],
      });
    }
    const resolvedFields = resolveExpandFields(
      this.state.entityType,
      navName,
      fields,
    );

    // Merge with any existing expand on the same nav.
    const existing = this.state.expands.find((e) => e.navName === navName);
    let nextExpands: IExpandSpec[];
    if (existing) {
      const merged = Array.from(
        new Set([...existing.fields, ...resolvedFields]),
      );
      nextExpands = this.state.expands.map((e) =>
        e === existing ? { navName, fields: merged } : e,
      );
    } else {
      nextExpands = [
        ...this.state.expands,
        { navName, fields: resolvedFields },
      ];
    }
    return this.withState({ expands: nextExpands });
  }

  include<TProp>(
    selector: (e: T) => TProp,
  ): IncludableQuery<T, NavTarget<TProp>> {
    const navName = captureSelectorName(selector as (e: never) => unknown);
    const newNode: IIncludeNode = { navName, children: [] };
    const newIncludes = [...this.state.includes, newNode];
    const nextState: IQueryState<T> = { ...this.state, includes: newIncludes };
    return new IncludableQuery<T, NavTarget<TProp>>(
      nextState,
      this.executor,
      newNode,
    );
  }

  async toArrayAsync(): Promise<T[]> {
    return this.executor.toArrayAsync(this.state);
  }
  async firstOrDefaultAsync(): Promise<T | null> {
    return this.executor.firstOrDefaultAsync(this.state);
  }
  async singleOrDefaultAsync(): Promise<T | null> {
    return this.executor.singleOrDefaultAsync(this.state);
  }
  async countAsync(): Promise<number> {
    return this.executor.countAsync(this.state);
  }
  async anyAsync(): Promise<boolean> {
    return this.executor.anyAsync(this.state);
  }
}

export class IncludableQuery<
  T extends IEntity,
  TPrev extends IEntity,
> extends Query<T> {
  private readonly _lastNode: IIncludeNode;

  constructor(
    state: IQueryState<T>,
    executor: QueryExecutor<T>,
    lastNode: IIncludeNode,
  ) {
    super(state, executor);
    this._lastNode = lastNode;
  }

  thenInclude<TProp>(
    selector: (e: TPrev) => TProp,
  ): IncludableQuery<T, NavTarget<TProp>> {
    const navName = captureSelectorName(selector as (e: never) => unknown);
    const child: IIncludeNode = { navName, children: [] };
    // Mutate _lastNode's children. Since IIncludeNode.children is the mutable
    // surface and we always create a fresh _lastNode reference per include call,
    // mutation here is safe and only affects this chain branch.
    this._lastNode.children.push(child);
    return new IncludableQuery<T, NavTarget<TProp>>(
      this.state,
      this.executor,
      child,
    );
  }
}
