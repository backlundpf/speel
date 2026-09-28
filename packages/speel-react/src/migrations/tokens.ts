/**
 * Status accents for the migrations UI.
 *
 * The primitives come from the skin, but a plan's meaning lives in a handful of
 * colours the adapter has no vocabulary for — applied vs pending, destructive,
 * the muted gutter of a step that will not run. They are CSS custom properties so
 * a host that themes the rest of the app can theme these too; the fallbacks are
 * the Fluent v8 palette this UI grew up in.
 */
export const ACCENT = {
  /** Applied, present, succeeded. */
  ok: "var(--speel-accent-ok, #107c10)",
  /** Destructive, failed, "this would change the site". */
  danger: "var(--speel-accent-danger, #a4262c)",
  /** Secondary text: presence labels, step counts. */
  muted: "var(--speel-accent-muted, #605e5c)",
  /** Tertiary text: a step that will not run, the current-row marker. */
  faint: "var(--speel-accent-faint, #a19f9d)",
  /** Primary text in the log transcript. */
  ink: "var(--speel-accent-ink, #323130)",
  /** The gutter beside a step, and the log box border. */
  rule: "var(--speel-accent-rule, #e1dfdd)",
  /** The log transcript's own background. */
  surface: "var(--speel-accent-surface, #faf9f8)",
} as const;
