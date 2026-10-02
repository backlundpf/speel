import type { MigrationOperation } from "../operations/operations.js";

/** Live state of an operation's target. 'unknown' when unannotated or unreadable. */
export type StepPresence = "present" | "absent" | "unknown";

export interface PlanOptions {
  /** Plan a single migration by id, regardless of its applied state. */
  only?: string;
  /** Plan the sequence `migrateTo(to)` would run. Default: every pending migration, up. */
  to?: string | "0";
  /** Annotate each schema op with live presence. Costs one read per op. */
  annotate?: boolean;
}

export interface PlanStep {
  migrationId: string;
  direction: "up" | "down";
  op: MigrationOperation;
  /** Human summary, e.g. 'Add field DueDate (DateTime) to "Tasks"'. */
  summary: string;
  /** Would this step execute if the previewed action were taken now? */
  willRun: boolean;
  /** Data loss if it runs: dropField, dropList. */
  destructive: boolean;
  /**
   * Set when an alterField changes the column's type in a way that may lose
   * data (Note → Text truncates to 255 characters). The step still runs.
   */
  warning?: string;
  presence: StepPresence;
  /** Custom code — effects cannot be previewed. */
  opaque: boolean;
  label?: string;
  source?: string;
}

export interface MigrationPlan {
  direction: "up" | "down";
  steps: PlanStep[];
}
