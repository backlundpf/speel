import type { ListTemplate, DbContext } from "@speel/core";
import type { FieldSpec } from "../FieldSpec.js";

export interface ListSpec {
  title: string;
  template: ListTemplate;
  url?: string;
  description?: string;
  onQuickLaunch?: boolean;
  /** Item-level security; `'own'` restricts users to the items they created. Creation only. */
  readSecurity?: "all" | "own";
  writeSecurity?: "all" | "own";
}

export interface RunContext {
  context: DbContext;
  state: Record<string, unknown>;
}

export type MigrationOperation =
  | { op: "createList"; title: string; spec: ListSpec }
  | { op: "dropList"; title: string }
  | { op: "renameList"; from: string; to: string }
  | { op: "addField"; list: string; field: FieldSpec }
  | { op: "alterField"; list: string; field: FieldSpec }
  | { op: "dropField"; list: string; name: string }
  | { op: "renameField"; list: string; from: string; to: string }
  | { op: "addIndex"; list: string; field: string }
  | { op: "dropIndex"; list: string; field: string }
  | { op: "run"; run: (ctx: RunContext) => Promise<void>; label?: string };

export type SchemaOperation = Exclude<MigrationOperation, { op: "run" }>;
