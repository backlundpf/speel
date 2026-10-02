import * as React from "react";
import { useSpeelUI } from "../context.js";
import { SpeelPanel } from "../surface/SpeelPanel.js";
import type { SpeelAction } from "../actions.js";
import { ACCENT } from "./tokens.js";
import type {
  MigrationsPlan,
  MigrationsPlanStep,
  StepPresence,
} from "./MigrationsManager.js";

export interface MigrationPreviewPanelProps {
  migrationId: string;
  /** null while the plan is loading. */
  plan: MigrationsPlan | null;
  onDismiss: () => void;
  /** Supplied only when the migration is pending. Runs what this preview shows. */
  onApply?: () => void;
  /** Supplied only when the migration is pending and the runner supports it. */
  onMarkApplied?: () => void;
}

const presenceLabel = (p: StepPresence): string =>
  p === "present"
    ? "already present"
    : p === "absent"
      ? "not present"
      : "unverifiable";

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

function Step({
  step,
  showMigrationId,
}: {
  step: MigrationsPlanStep;
  showMigrationId: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: "6px 8px",
        borderLeft: `3px solid ${step.willRun ? "var(--speel-accent-active, #0078d4)" : ACCENT.rule}`,
      }}
    >
      <div style={row}>
        <span
          style={{ fontFamily: "monospace", color: ACCENT.muted, width: 34 }}
        >
          {step.direction}
        </span>
        {showMigrationId && (
          <span style={{ fontFamily: "monospace", color: ACCENT.faint }}>
            {step.migrationId}
          </span>
        )}
        <span style={{ flexGrow: 1, minWidth: 160 }}>{step.summary}</span>
        {step.destructive && (
          <span style={{ color: ACCENT.danger, fontWeight: 600 }}>
            destructive
          </span>
        )}
        {step.warning !== undefined && (
          <span style={{ color: ACCENT.warn, fontWeight: 600 }}>
            may lose data
          </span>
        )}
        <span style={{ color: ACCENT.muted }}>
          {presenceLabel(step.presence)}
        </span>
        <span
          style={{
            color: step.willRun ? ACCENT.ok : ACCENT.faint,
            minWidth: 54,
          }}
        >
          {step.willRun ? "will run" : "skipped"}
        </span>
      </div>
      {step.warning !== undefined && (
        <span style={{ color: ACCENT.warn }}>{step.warning}</span>
      )}
      {step.opaque && (
        <div style={{ display: "grid", gap: 2 }}>
          <span style={{ color: ACCENT.muted }}>
            Custom data step — effects cannot be previewed.
          </span>
          {step.source !== undefined && (
            <pre
              style={{
                margin: 0,
                padding: 6,
                background: ACCENT.surface,
                fontSize: 11,
                overflowX: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {step.source}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only preview of one migration's operations: what would run, what is already
 * present on the site, which steps destroy data, and which may lose data (a
 * narrowing type change such as Note → Text, which still runs). Presence is existence-only —
 * it cannot confirm that an existing field's type matches the migration's spec.
 *
 * Rendered as a `SpeelPanel`, so it carries the same chrome as every other surface
 * in the library — resizable, light-dismissable, actions in the footer — and wears
 * the host's skin. Needs a `SpeelUIProvider` (or a `SpeelProvider`) above it.
 */
export function MigrationPreviewPanel({
  migrationId,
  plan,
  onDismiss,
  onApply,
  onMarkApplied,
}: MigrationPreviewPanelProps): React.ReactElement {
  const ui = useSpeelUI();
  const [showAll, setShowAll] = React.useState(false);

  const steps = plan?.steps ?? [];
  const visible = showAll ? steps : steps.filter((s) => s.willRun);
  const runCount = steps.filter((s) => s.willRun).length;
  // A plan that mirrors migrateTo can span several migrations; name each step's
  // own migration so the list is readable.
  const showMigrationId = new Set(steps.map((s) => s.migrationId)).size > 1;
  // Anything not already present would really change the site — including steps
  // that cannot be checked at all (run steps, index ops). Scoped to the previewed
  // migration, because that is all Mark applied records.
  const unverified = steps.filter(
    (s) =>
      s.willRun && s.migrationId === migrationId && s.presence !== "present",
  ).length;

  const actions: SpeelAction[] = [];
  if (onApply)
    actions.push({
      key: "apply",
      text: "Apply",
      // Running the plan is the safe direction, so no confirm — only Restore
      // (down, on the row) asks. The accessible name carries the migration id
      // because "Apply" also sits on the row behind this panel.
      ariaLabel: `Apply ${migrationId}`,
      primary: true,
      onClick: onApply,
    });
  if (onMarkApplied)
    actions.push({
      key: "mark-applied",
      text: "Mark applied",
      onClick: () => {
        if (unverified > 0) {
          const ok =
            typeof window === "undefined" ||
            window.confirm(
              `Mark "${migrationId}" as applied without running it? ${unverified} step(s) are not already present on this site.`,
            );
          if (!ok) return;
        }
        onMarkApplied();
      },
    });

  return (
    <SpeelPanel
      open
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title={`Preview — ${migrationId}`}
      {...(actions.length ? { actions } : {})}
    >
      {plan === null ? (
        <ui.Spinner label="Planning…" />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          <span style={{ color: ACCENT.muted }}>
            {runCount} of {steps.length} steps would run.
          </span>
          <ui.Checkbox
            label="Show all steps"
            checked={showAll}
            onChange={setShowAll}
          />
          {visible.length === 0 ? (
            <span>
              {showAll
                ? "This migration defines no operations."
                : "Nothing in this migration will run."}
            </span>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {visible.map((s, i) => (
                <Step
                  key={`${s.migrationId}-${i}`}
                  step={s}
                  showMigrationId={showMigrationId}
                />
              ))}
            </div>
          )}
          {onMarkApplied && unverified > 0 && (
            <ui.MessageBar intent="warning">
              {`${unverified === 1 ? "1 step" : `${unverified} steps`} would change this site — marking applied records the migration without running them.`}
            </ui.MessageBar>
          )}
        </div>
      )}
    </SpeelPanel>
  );
}
