/**
 * Global stacking order for Speel's portaled overlays. Larger = closer to the user.
 * Top-to-bottom: toasts > running tasks > blocking tasks > Fluent modals/panels
 * (their Layer sits at ≈ 1_000_000) > app. The blocking scrim is intentionally above
 * Fluent's modal/panel Layer so a blocking task overlays even an open modal or panel.
 */
export const Z = {
  blockingTasks: 2_000_000,
  runningTasks: 3_000_000,
  toasts: 4_000_000,
} as const;

/** Marks a body-level layer that stacks above the blocking scrim (toasts, the running-task
 *  stack), so a blocking task leaves it reachable instead of making it inert. */
export const ABOVE_BLOCKING_ATTR = "data-speel-above-blocking";
/** Marks a blocking overlay's own root (one per provider), which a block never seals. */
export const BLOCKING_OVERLAY_ATTR = "data-speel-blocking-overlay";
