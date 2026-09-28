import type { IExpandSpec } from "./IncludeNode.js";

/**
 * A model-registered expandable that is not an FK navigation: it owns its whole wire
 * clause (nested $expand/$select paths, extra top-level $select fields) and its own
 * materialization. `Query.expand()` consults the registry by selector name before the
 * navigation machinery, and `Materialize` runs `spec().materialize` instead of nav
 * attachment.
 *
 * Core knows only that such handlers exist — what they load is the registrant's business
 * (e.g. @speel/identity registers the securable snapshot under `RoleAssignments`).
 */
export interface SpecialExpand {
  navName: string;
  /** The full clause, including the `materialize` callback carried on the spec. */
  spec(): IExpandSpec;
}
