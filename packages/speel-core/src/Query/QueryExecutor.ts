// src/Query/QueryExecutor.ts
import type { IEntity } from "../types.js";
import type { EntityType } from "../Metadata/EntityType.js";
import type {
  IStorageProvider,
  IGetItemsOptions,
  IOrderKey,
  IExpandClause,
  IReadOperation,
} from "../providers/ISharePointProvider.js";
import type { ChangeTracker } from "../ChangeTracker/ChangeTracker.js";
import type { INavigation } from "../Metadata/Navigation.js";
import { EntityState } from "../ChangeTracker/EntityEntry.js";
import { Snapshot } from "../ChangeTracker/Snapshot.js";
import { Materialize } from "../Query/Materialize.js";
import type { FilterNode } from "./FilterNode.js";
import type { IIncludeNode, IExpandSpec } from "./IncludeNode.js";
import { planIncludeLevel, applyIncludeLevel } from "./IncludeResolver.js";
import { dedupeReadOperations, runReadBatch } from "./ReadBatch.js";
import { extractContainerOptions } from "./containerScope.js";
import { resolveExpandColumn } from "./expandResolution.js";
import { recordId } from "../Cache/ICacheProvider.js";
import type { SpecialExpand } from "./SpecialExpand.js";
import { DataException, InvalidOperationException } from "../errors.js";

export interface IQueryState<T extends IEntity> {
  readonly entityType: EntityType<T>;
  readonly filter?: FilterNode;
  readonly orderBy: readonly IOrderKey[];
  readonly take?: number;
  readonly skip?: number;
  readonly noTracking: boolean;
  readonly includes: readonly IIncludeNode[];
  readonly expands: readonly IExpandSpec[];
}

const DEFAULT_PAGE_SIZE = 1000;

function collectImplicitNavExpands<T extends IEntity>(
  state: IQueryState<T>,
): { navName: string; field: string }[] {
  const found = new Map<string, Set<string>>();
  const addPath = (col: string): void => {
    if (!col.includes("/")) return;
    const [nav, field] = col.split("/");
    if (!nav || !field) return;
    if (!found.has(nav)) found.set(nav, new Set());
    found.get(nav)!.add(field);
  };
  const walk = (node: FilterNode | undefined): void => {
    if (!node) return;
    switch (node.kind) {
      case "compare":
      case "in":
      case "is-null":
      case "string":
      case "multichoice":
        addPath(node.column);
        break;
      case "and":
      case "or":
        for (const c of node.children) walk(c);
        break;
      case "not":
        walk(node.child);
        break;
    }
  };
  walk(state.filter);
  for (const k of state.orderBy) addPath(k.column);
  return [...found.entries()].flatMap(([nav, fields]) =>
    [...fields].map((field) => ({ navName: nav, field })),
  );
}

function buildExpandOption<T extends IEntity>(
  state: IQueryState<T>,
): readonly IExpandClause[] | undefined {
  // The target's properties and source ride each clause: the provider types the
  // expanded sub-records, and a provider-routed target tells it the inline expand
  // is a person column. A special expand is not a navigation and gets neither.
  const targetOf = (navName: string) =>
    state.entityType.findNavigation(navName)?.target;
  const explicit: IExpandClause[] = state.expands.map((e) => {
    const navColumn = resolveExpandColumn(state.entityType, e.navName);
    const target = targetOf(e.navName);
    return {
      navColumn,
      selectFields: [...e.fields],
      ...(e.expandPaths ? { expandPaths: [...e.expandPaths] } : {}),
      ...(e.selectPaths ? { selectPaths: [...e.selectPaths] } : {}),
      ...(target
        ? { properties: target.properties, source: target.sourceHandle }
        : {}),
    };
  });
  const implicits = collectImplicitNavExpands(state);
  if (implicits.length === 0) return explicit.length ? explicit : undefined;
  // Merge implicit single-field expands into the matching explicit clause (or add a new
  // one), preserving any nested expandPaths/selectPaths already on the explicit clause.
  const byNav = new Map<string, IExpandClause>();
  for (const e of explicit) byNav.set(e.navColumn, e);
  for (const im of implicits) {
    let clause = byNav.get(im.navName);
    if (!clause) {
      const target = targetOf(im.navName);
      clause = {
        navColumn: im.navName,
        selectFields: [],
        ...(target
          ? { properties: target.properties, source: target.sourceHandle }
          : {}),
      };
      byNav.set(im.navName, clause);
    }
    if (!clause.selectFields.includes(im.field)) {
      clause.selectFields = [...clause.selectFields, im.field];
    }
  }
  return [...byNav.values()];
}

/** One navigation to resolve, paired with the parents it resolves against. */
interface ILevelTask {
  node: IIncludeNode;
  nav: INavigation;
  parents: readonly Record<string, unknown>[];
}

interface IPlannedTask {
  task: ILevelTask;
  ops: readonly IReadOperation[];
}

function toLevelTasks(
  parents: readonly Record<string, unknown>[],
  et: EntityType,
  nodes: readonly IIncludeNode[],
): ILevelTask[] {
  const out: ILevelTask[] = [];
  for (const node of nodes) {
    const nav = et.findNavigation(node.navName);
    if (!nav) continue; // Compiler-typed APIs prevent this; silent skip is safe.
    out.push({ node, nav, parents });
  }
  return out;
}

/**
 * Name the navigation behind a failed level read. The provider (or runReadBatch's
 * fallback) attributes the failure to an operation via `clientToken`; map that back to
 * its task so a query-string-limit 400 on a deep include says which navigation it was,
 * instead of surfacing as a bare 400. Unattributable failures rethrow untouched.
 */
function describeReadFailure(
  err: unknown,
  planned: readonly IPlannedTask[],
): unknown {
  const token = (err as { clientToken?: unknown } | null)?.clientToken;
  if (typeof token !== "string") return err;
  const owner = planned.find((p) =>
    p.ops.some((op) => op.clientToken === token),
  );
  if (!owner) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new DataException(
    `Loading navigation '${owner.task.node.navName}' (${owner.task.nav.target.ctor.name}) failed: ${detail}`,
  );
}

export class QueryExecutor<T extends IEntity> {
  constructor(
    private readonly provider: IStorageProvider,
    private readonly tracker: ChangeTracker,
    private readonly specialExpandLookup?: (
      name: string,
    ) => SpecialExpand | undefined,
  ) {}

  /** The model-registered special expandable behind `name`, if any. */
  findSpecialExpand(name: string): SpecialExpand | undefined {
    return this.specialExpandLookup?.(name);
  }

  async toArrayAsync(state: IQueryState<T>): Promise<T[]> {
    const cap = state.take ?? Infinity;
    const fields = state.entityType.columnNames;
    const source = state.entityType.sourceHandle;
    const out: T[] = [];
    let cursor: string | undefined;
    let skipForFirst = state.skip;
    const expand = buildExpandOption(state);
    const { filter: cleanFilter, includeContainers } = extractContainerOptions(
      state.filter,
    );

    while (out.length < cap) {
      const remainingCap = cap - out.length;
      const pageSize = Number.isFinite(remainingCap)
        ? Math.min(DEFAULT_PAGE_SIZE, remainingCap)
        : DEFAULT_PAGE_SIZE;

      // The provider types every column these properties describe before the
      // records come back; Materialize applies only the user's codec.fromProvider.
      const options: IGetItemsOptions = {
        properties: state.entityType.properties,
      };
      if (cleanFilter) options.filter = cleanFilter;
      if (includeContainers) options.includeContainers = true;
      if (state.orderBy.length > 0) options.orderBy = state.orderBy;
      if (skipForFirst !== undefined && skipForFirst > 0)
        options.skip = skipForFirst;
      if (expand) options.expand = expand;
      skipForFirst = undefined;

      const page = await this.provider.getItemsPagedAsync(
        source,
        fields,
        pageSize,
        cursor,
        options,
      );

      for (const rec of page.items) {
        if (out.length >= cap) break;
        const id = recordId(rec);
        if (state.noTracking) {
          const entity = Materialize.item(rec, state.entityType);
          Materialize.attachExpands(
            entity as unknown as Record<string, unknown>,
            rec,
            state.entityType,
            state.expands,
          );
          out.push(entity);
          continue;
        }
        const existing = this.tracker.findEntry(state.entityType.ctor, id);
        if (existing && existing.state !== EntityState.Detached) {
          // Eager-loaded expand data must still attach to an already-tracked
          // parent (the page record carries it, even on an identity-map hit).
          Materialize.attachExpands(
            existing.entity as unknown as Record<string, unknown>,
            rec,
            state.entityType,
            state.expands,
          );
          // What a read just attached is the server's state, so it is this nav's
          // ORIGINAL — not a pending edit. Without the reset, pass-1 fixup reads the
          // freshly-attached nav as a change and rewrites the FK from it, reverting a
          // direct FK edit made before the re-query. A fresh entity needs no such call:
          // its snapshot is taken below, after its expands attach.
          for (const ex of state.expands) {
            if (state.entityType.findNavigation(ex.navName))
              existing.markNavLoaded(ex.navName);
          }
          out.push(existing.entity as T);
          continue;
        }
        const entity = Materialize.item(rec, state.entityType);
        Materialize.attachExpands(
          entity as unknown as Record<string, unknown>,
          rec,
          state.entityType,
          state.expands,
        );
        const snap = Snapshot.take(entity, state.entityType);
        this.tracker.track(entity, EntityState.Unchanged, snap);
        out.push(entity);
      }

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    // Resolve includes (each top-level node, sequentially; recurse for children).
    await this.resolveIncludeTree(
      out as unknown as Record<string, unknown>[],
      state.entityType,
      state.includes,
      state.noTracking,
    );

    return out;
  }

  /**
   * Resolve the include forest breadth-first: every navigation at the same depth is
   * planned together and fetched in ONE provider read call, then applied, then its
   * children become the next level. Depth-first would serialize sibling branches — a
   * shallow lookup would wait behind an unrelated branch's deeper levels.
   */
  private async resolveIncludeTree(
    rootParents: readonly Record<string, unknown>[],
    rootType: EntityType,
    includes: readonly IIncludeNode[],
    noTracking: boolean,
  ): Promise<void> {
    let seq = 0;
    const nextToken = (): string => `r${seq++}`;
    let level = toLevelTasks(rootParents, rootType, includes);

    while (level.length > 0) {
      const planned: IPlannedTask[] = level.map((task) => ({
        task,
        ops: planIncludeLevel(task.parents, task.nav, this.provider, nextToken),
      }));

      // Sibling navigations against the same target plan overlapping id reads; merge
      // them so the batch asks each target once. A merged op keeps its FIRST owner's
      // clientToken, so describeReadFailure still names a navigation unchanged.
      const { ops: deduped, remap } = dedupeReadOperations(
        planned.flatMap((p) => p.ops),
      );

      let byToken: Map<string, readonly Record<string, unknown>[]>;
      try {
        byToken = await runReadBatch(this.provider, deduped);
      } catch (err) {
        throw describeReadFailure(err, planned);
      }

      const next: ILevelTask[] = [];
      for (const { task, ops } of planned) {
        const records = ops.flatMap((op) => [
          ...(byToken.get(remap.get(op.clientToken) ?? op.clientToken) ?? []),
        ]);
        // Always applied: a task that planned nothing still owes its parents an empty
        // navigation and a snapshot baseline.
        const loaded = applyIncludeLevel(
          task.parents,
          task.nav,
          records,
          this.tracker,
          noTracking,
        );
        if (task.node.children.length > 0) {
          next.push(
            ...toLevelTasks(loaded, task.nav.target, task.node.children),
          );
        }
      }
      level = next;
    }
  }

  async firstOrDefaultAsync(state: IQueryState<T>): Promise<T | null> {
    const r = await this.toArrayAsync({ ...state, take: 1 });
    return r[0] ?? null;
  }

  async singleOrDefaultAsync(state: IQueryState<T>): Promise<T | null> {
    const r = await this.toArrayAsync({ ...state, take: 2 });
    if (r.length > 1) {
      throw new InvalidOperationException(
        `singleOrDefaultAsync matched more than one element on ${state.entityType.ctor.name}.`,
      );
    }
    return r[0] ?? null;
  }

  async countAsync(state: IQueryState<T>): Promise<number> {
    const { filter, includeContainers } = extractContainerOptions(state.filter);
    const options: { filter?: FilterNode; includeContainers?: boolean } = {};
    if (filter) options.filter = filter;
    if (includeContainers) options.includeContainers = true;
    return this.provider.countAsync(state.entityType.sourceHandle, options);
  }

  async anyAsync(state: IQueryState<T>): Promise<boolean> {
    return (await this.countAsync(state)) > 0;
  }
}
