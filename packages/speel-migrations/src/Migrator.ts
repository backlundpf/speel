import type { DbContext } from "@speel/core";
import type { Migration } from "./defineMigration.js";
import { recordOps } from "./operations/MigrationBuilder.js";
import type {
  MigrationOperation,
  SchemaOperation,
} from "./operations/operations.js";
import type { ISchemaProvider } from "./schema/ISchemaProvider.js";
import {
  applyResultToSnapshot,
  isSatisfied,
  type SchemaSnapshot,
} from "./schema/SchemaSnapshot.js";
import type { IHistoryStore } from "./history/IHistoryStore.js";
import { SharePointHistoryStore } from "./history/SharePointHistoryStore.js";
import type { MigrationPlan, PlanOptions, PlanStep } from "./plan/PlanTypes.js";
import { buildSteps, summarizeOp } from "./plan/buildSteps.js";
import { annotateSteps } from "./plan/presence.js";
import { alterFieldDataLoss, annotateDataLoss } from "./plan/dataLoss.js";
import { computeWaves, splitFences } from "./plan/waves.js";
import { MigrationApplyError } from "./MigrationApplyError.js";
import {
  noProgress,
  type MigrateOptions,
  type ProgressEmit,
} from "./progress.js";

export interface MigratorOptions {
  context: DbContext;
  schema: ISchemaProvider;
  migrations: readonly Migration[];
  /**
   * Title of the list the applied-migration bookkeeping lives in. Defaults to
   * `SpeelMigrationsHistory`. Ignored when `history` is supplied.
   */
  historyList?: string;
  /** Override the history store (tests inject a fake). Defaults to the SharePoint-backed store. */
  history?: IHistoryStore;
}

export interface MigrateResult {
  direction: "up" | "down";
  ran: string[];
  log: string[];
}

export class Migrator {
  private readonly context: DbContext;
  private readonly schema: ISchemaProvider;
  private readonly ordered: Migration[];
  private readonly history: IHistoryStore;

  constructor(opts: MigratorOptions) {
    this.context = opts.context;
    this.schema = opts.schema;
    this.ordered = [...opts.migrations].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    this.history =
      opts.history ??
      new SharePointHistoryStore(opts.context, opts.schema, opts.historyList);
  }

  /**
   * One schema read per command, shared by history bootstrap, planning, and
   * execution. Every public entry point starts here.
   */
  private async begin(): Promise<SchemaSnapshot> {
    const snapshot = await this.schema.readSchemaAsync();
    await this.history.bootstrap(snapshot);
    return snapshot;
  }

  async status(): Promise<{ applied: string[]; pending: string[] }> {
    await this.begin();
    const appliedSet = new Set(await this.history.applied());
    const applied = this.ordered
      .filter((m) => appliedSet.has(m.id))
      .map((m) => m.id);
    const pending = this.ordered
      .filter((m) => !appliedSet.has(m.id))
      .map((m) => m.id);
    return { applied, pending };
  }

  /**
   * The operations `migrate()` / `migrateTo()` would run, without running them.
   * Performs no schema writes of its own; `bootstrap()` still creates the history
   * list when absent, exactly as `status()` does.
   */
  async plan(options: PlanOptions = {}): Promise<MigrationPlan> {
    const snapshot = await this.begin();
    const appliedSet = new Set(await this.history.applied());
    const steps: PlanStep[] = [];

    if (options.only !== undefined) {
      const m = this.ordered.find((x) => x.id === options.only);
      if (!m) throw new Error(`plan: unknown migration '${options.only}'`);
      steps.push(
        ...buildSteps(m.id, "up", recordOps(m.up), !appliedSet.has(m.id)),
      );
      return this.finish("up", steps, options.annotate, snapshot);
    }

    if (options.to !== undefined) {
      const targetIndex =
        options.to === "0"
          ? -1
          : this.ordered.findIndex((m) => m.id === options.to);
      if (targetIndex === -1 && options.to !== "0") {
        throw new Error(`plan: unknown target '${options.to}'`);
      }
      for (let i = 0; i <= targetIndex; i++) {
        const m = this.ordered[i]!;
        if (appliedSet.has(m.id)) continue;
        steps.push(...buildSteps(m.id, "up", recordOps(m.up), true));
      }
      if (steps.length > 0)
        return this.finish("up", steps, options.annotate, snapshot);

      // Mirrors migrateTo: down only when the up pass ran nothing.
      for (let i = this.ordered.length - 1; i > targetIndex; i--) {
        const m = this.ordered[i]!;
        if (!appliedSet.has(m.id)) continue;
        steps.push(...buildSteps(m.id, "down", recordOps(m.down), true));
      }
      return this.finish("down", steps, options.annotate, snapshot);
    }

    for (const m of this.ordered) {
      if (appliedSet.has(m.id)) continue;
      steps.push(...buildSteps(m.id, "up", recordOps(m.up), true));
    }
    return this.finish("up", steps, options.annotate, snapshot);
  }

  /**
   * Record a migration as applied without running it — for a baseline whose schema
   * already exists on the target site. Preview with `plan({ only: id, annotate: true })`
   * first: every step should report `presence: 'present'`.
   */
  async markApplied(id: string): Promise<void> {
    if (!this.ordered.some((m) => m.id === id)) {
      throw new Error(`markApplied: unknown migration '${id}'`);
    }
    await this.begin();
    const appliedSet = new Set(await this.history.applied());
    if (appliedSet.has(id)) return;
    await this.history.record(id);
  }

  private async finish(
    direction: "up" | "down",
    steps: PlanStep[],
    annotate: boolean | undefined,
    snapshot: SchemaSnapshot,
  ): Promise<MigrationPlan> {
    // Data-loss warnings come from the read begin() already made, so every
    // plan carries them, annotated or not.
    annotateDataLoss(snapshot, steps);
    if (annotate === true) annotateSteps(snapshot, steps);
    return { direction, steps };
  }

  /** Apply every pending migration's `up`, in id order. */
  async migrate(options: MigrateOptions = {}): Promise<MigrateResult> {
    const emit = options.onProgress ?? noProgress;
    const snapshot = await this.begin();
    const appliedSet = new Set(await this.history.applied());
    const log: string[] = [];
    const ran: string[] = [];
    for (const m of this.ordered) {
      if (appliedSet.has(m.id)) continue;
      emit({ kind: "migration-start", migrationId: m.id, direction: "up" });
      await this.runOps(recordOps(m.up), snapshot, m.id, log, emit);
      await this.history.record(m.id);
      ran.push(m.id);
      log.push(`up ${m.id}`);
      emit({ kind: "migration-done", migrationId: m.id, direction: "up" });
    }
    return { direction: "up", ran, log };
  }

  /** Move the schema to a target migration id ('0' = before all). Applies `up` or `down` as needed. */
  async migrateTo(
    targetId: string | "0",
    options: MigrateOptions = {},
  ): Promise<MigrateResult> {
    const emit = options.onProgress ?? noProgress;
    const snapshot = await this.begin();
    const targetIndex =
      targetId === "0" ? -1 : this.ordered.findIndex((m) => m.id === targetId);
    if (targetIndex === -1 && targetId !== "0") {
      throw new Error(`migrateTo: unknown target '${targetId}'`);
    }
    const appliedSet = new Set(await this.history.applied());
    const log: string[] = [];
    const ran: string[] = [];

    // Up: pending migrations at or before the target, ascending.
    for (let i = 0; i <= targetIndex; i++) {
      const m = this.ordered[i]!;
      if (appliedSet.has(m.id)) continue;
      emit({ kind: "migration-start", migrationId: m.id, direction: "up" });
      await this.runOps(recordOps(m.up), snapshot, m.id, log, emit);
      await this.history.record(m.id);
      ran.push(m.id);
      log.push(`up ${m.id}`);
      emit({ kind: "migration-done", migrationId: m.id, direction: "up" });
    }
    if (ran.length > 0) return { direction: "up", ran, log };

    // Down: applied migrations after the target, descending.
    for (let i = this.ordered.length - 1; i > targetIndex; i--) {
      const m = this.ordered[i]!;
      if (!appliedSet.has(m.id)) continue;
      emit({ kind: "migration-start", migrationId: m.id, direction: "down" });
      await this.runOps(recordOps(m.down), snapshot, m.id, log, emit);
      await this.history.unrecord(m.id);
      ran.push(m.id);
      log.push(`down ${m.id}`);
      emit({ kind: "migration-done", migrationId: m.id, direction: "down" });
    }
    return { direction: "down", ran, log };
  }

  /**
   * Execute one migration's recorded operations, batching each dependency-free
   * wave into a single `applyAsync` call.
   *
   * Ops the snapshot already satisfies never leave the process. A wave that
   * reports any failure aborts the migration before the wave that depended on
   * it — the failed wave's siblings are already committed, which is what makes
   * a re-run cheap rather than a problem.
   *
   * `emit` reports each step as it goes. A wave is announced in full before the
   * request leaves, so whatever is stuck is on screen while it is stuck.
   */
  protected async runOps(
    ops: readonly MigrationOperation[],
    snapshot: SchemaSnapshot,
    migrationId: string,
    log: string[],
    emit: ProgressEmit = noProgress,
  ): Promise<void> {
    const state: Record<string, unknown> = {};
    for (const fence of splitFences(ops)) {
      if (fence.kind === "run") {
        const summary = summarizeOp(fence.op);
        emit({ kind: "step-start", migrationId, summary });
        try {
          await fence.op.run({ context: this.context, state });
        } catch (e) {
          // A data step's failure is the caller's to handle, but an admin
          // watching deserves to see WHICH step died before the error lands.
          emit({
            kind: "step-done",
            migrationId,
            summary,
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
        emit({ kind: "step-done", migrationId, summary, status: "applied" });
        continue;
      }
      for (const wave of computeWaves(fence.ops)) {
        const pending = wave.filter((op) => {
          if (!isSatisfied(snapshot, op)) return true;
          log.push(`skip ${migrationId} ${summarizeOp(op)}`);
          emit({
            kind: "step-done",
            migrationId,
            summary: summarizeOp(op),
            status: "skipped",
          });
          return false;
        });
        if (pending.length === 0) continue;

        // Judged against the live type BEFORE the wave lands — afterwards the
        // snapshot already holds the new type. The step runs regardless.
        const warnings = new Map<SchemaOperation, string>();
        for (const op of pending) {
          const warning = dataLossOf(snapshot, op);
          if (warning === undefined) continue;
          warnings.set(op, warning);
          log.push(`warn ${migrationId} ${summarizeOp(op)}: ${warning}`);
          console.warn(
            `[speel migrations] ${migrationId}: ${summarizeOp(op)} — ${warning}`,
          );
        }
        for (const op of pending) {
          const warning = warnings.get(op);
          emit({
            kind: "step-start",
            migrationId,
            summary: summarizeOp(op),
            ...(warning !== undefined ? { warning } : {}),
          });
        }
        const results = await this.schema.applyAsync(pending, snapshot);
        for (const r of results) applyResultToSnapshot(snapshot, r);
        for (const r of results) {
          const warning = warnings.get(r.op);
          emit({
            kind: "step-done",
            migrationId,
            summary: summarizeOp(r.op),
            status: r.status,
            ...(r.error ? { error: r.error.message } : {}),
            ...(warning !== undefined ? { warning } : {}),
          });
        }

        const failures = results.filter((r) => r.status === "failed");
        if (failures.length > 0) {
          throw new MigrationApplyError(migrationId, failures);
        }
      }
    }
  }
}

/** The data-loss warning for an alterField against the column's live type. */
function dataLossOf(
  snapshot: SchemaSnapshot,
  op: SchemaOperation,
): string | undefined {
  if (op.op !== "alterField") return undefined;
  const current = snapshot.lists
    .get(op.list)
    ?.fields.get(op.field.internalName)?.typeAsString;
  return current === undefined
    ? undefined
    : alterFieldDataLoss(current, op.field);
}
