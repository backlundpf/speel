export { defineMigration } from "./defineMigration.js";
export type { Migration } from "./defineMigration.js";
export { MigrationBuilder, recordOps } from "./operations/MigrationBuilder.js";
export type {
  MigrationOperation,
  SchemaOperation,
  ListSpec,
  RunContext,
} from "./operations/operations.js";
export { FieldSpecBuilder } from "./operations/FieldSpecBuilder.js";
export type { FieldSpec, FieldSpecBase, FieldSpecKind } from "./FieldSpec.js";

export type { ISchemaProvider } from "./schema/ISchemaProvider.js";
export { FakeSchemaProvider } from "./schema/FakeSchemaProvider.js";
export type {
  SchemaSnapshot,
  SchemaOpResult,
  FieldInfo,
  ListInfo,
} from "./schema/SchemaSnapshot.js";
export {
  emptySnapshot,
  isSatisfied,
  applyResultToSnapshot,
} from "./schema/SchemaSnapshot.js";
export { computeWaves, splitFences } from "./plan/waves.js";
export type { OpFence, RunOperation } from "./plan/waves.js";

export { summarizeOp, isDestructive, buildSteps } from "./plan/buildSteps.js";
export { annotateSteps } from "./plan/presence.js";
export type {
  MigrationPlan,
  PlanStep,
  PlanOptions,
  StepPresence,
} from "./plan/PlanTypes.js";

export { Migrator } from "./Migrator.js";
export type { MigratorOptions, MigrateResult } from "./Migrator.js";
export type { MigrationEvent, MigrateOptions } from "./progress.js";
export { MigrationApplyError } from "./MigrationApplyError.js";
export type { IHistoryStore } from "./history/IHistoryStore.js";
export { FakeHistoryStore } from "./history/IHistoryStore.js";
export {
  SharePointHistoryStore,
  MigrationHistory,
  DEFAULT_HISTORY_LIST,
} from "./history/SharePointHistoryStore.js";
