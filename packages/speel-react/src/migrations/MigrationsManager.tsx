import * as React from "react";
import { useSpeelUI } from "../context.js";
import { MigrationPreviewPanel } from "./MigrationPreviewPanel.js";
import { ACCENT } from "./tokens.js";

export interface MigrationsStatus {
  applied: string[];
  pending: string[];
}
export interface MigrationResult {
  direction: "up" | "down";
  ran: string[];
}

/**
 * Structural mirror of `@speel/migrations`' `MigrationEvent` — what a run says
 * about itself while it runs, so the panel can show the step in flight instead
 * of a spinner that means both "working" and "hung".
 */
export type MigrationsEvent =
  | { kind: "migration-start"; migrationId: string; direction: "up" | "down" }
  | { kind: "migration-done"; migrationId: string; direction: "up" | "down" }
  | {
      kind: "step-start";
      migrationId: string;
      summary: string;
      /** Why this step may lose data. It runs anyway. */
      warning?: string;
    }
  | {
      kind: "step-done";
      migrationId: string;
      summary: string;
      status: "applied" | "skipped" | "failed";
      error?: string;
      warning?: string;
    };

/** Passed to `migrate()`/`migrateTo()`; a runner that ignores it still works. */
export interface MigrationProgress {
  onProgress?: (event: MigrationsEvent) => void;
}

/** Live state of a step's target, as reported by the migrator's plan. */
export type StepPresence = "present" | "absent" | "unknown";

/** Structural mirror of `@speel/migrations`' PlanStep, minus its `op` payload. */
export interface MigrationsPlanStep {
  migrationId: string;
  direction: "up" | "down";
  summary: string;
  willRun: boolean;
  destructive: boolean;
  /** Why this step may lose data (a narrowing type change). It runs anyway. */
  warning?: string;
  presence: StepPresence;
  opaque: boolean;
  label?: string;
  source?: string;
}

export interface MigrationsPlan {
  direction: "up" | "down";
  steps: MigrationsPlanStep[];
}

/**
 * The structural subset of `@speel/migrations`' `Migrator` this panel drives — so
 * `@speel/react` needs no dependency on `@speel/migrations` (a real `Migrator`
 * satisfies this shape).
 */
export interface MigrationsRunner {
  status(): Promise<MigrationsStatus>;
  migrate(options?: MigrationProgress): Promise<MigrationResult>;
  migrateTo(
    targetId: string,
    options?: MigrationProgress,
  ): Promise<MigrationResult>;
  /** Optional — when present, each row gets a preview button. */
  plan?(options?: {
    only?: string;
    to?: string;
    annotate?: boolean;
  }): Promise<MigrationsPlan>;
  /** Optional — when present, the preview panel offers Mark applied. */
  markApplied?(id: string): Promise<void>;
}

export interface MigrationsManagerProps {
  /** A Migrator built from the consumer's context + schema provider + migrations. */
  migrator: MigrationsRunner;
  /** Heading text. Default 'Schema migrations'. */
  title?: string;
  /** Called after a successful apply/revert with the result. */
  onApplied?: (result: MigrationResult) => void;
}

const messageOf = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

type StepStatus = "running" | "applied" | "skipped" | "failed";
interface LogStep {
  summary: string;
  status: StepStatus;
  error?: string;
  warning?: string;
}
interface LogGroup {
  migrationId: string;
  direction: "up" | "down";
  steps: LogStep[];
}

const headingOf = (direction: "up" | "down", migrationId: string): string =>
  `${direction === "up" ? "Applying" : "Reverting"} ${migrationId}`;

/** One line of output — the same text on screen and in the devtools console. */
function lineOf(step: LogStep): string {
  switch (step.status) {
    case "running":
      return `… ${step.summary}`;
    case "applied":
      return `✓ ${step.summary}`;
    case "skipped":
      return `↷ ${step.summary} — already there`;
    case "failed":
      return `✗ ${step.summary} — ${step.error ?? "failed"}`;
  }
}

/** The line under a step that may lose data. */
const warningLineOf = (warning: string): string =>
  `⚠ May lose data: ${warning}`;

/** A step taken from its event, carrying the event's error and warning. */
function stepOf(e: Extract<MigrationsEvent, { summary: string }>): LogStep {
  return {
    summary: e.summary,
    status: e.kind === "step-start" ? "running" : e.status,
    ...(e.kind === "step-done" && e.error !== undefined
      ? { error: e.error }
      : {}),
    ...(e.warning !== undefined ? { warning: e.warning } : {}),
  };
}

const COLOR_OF: Record<StepStatus, string> = {
  running: ACCENT.ink,
  applied: ACCENT.ok,
  skipped: ACCENT.muted,
  failed: ACCENT.danger,
};

const stack = (gap: number): React.CSSProperties => ({
  display: "grid",
  gap,
});
const rowOf = (gap: number): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap,
});

/**
 * Fold the event stream into groups of steps — one group per migration, which is
 * the unit an admin reads ("which migration is this?"), and the unit the console
 * mirror collapses.
 *
 * A `step-done` lands on the matching in-flight step; a step that reports done
 * without ever starting (a skip — nothing went out) becomes a line of its own.
 */
function groupEvents(events: readonly MigrationsEvent[]): LogGroup[] {
  const groups: LogGroup[] = [];
  for (const e of events) {
    if (e.kind === "migration-start") {
      groups.push({
        migrationId: e.migrationId,
        direction: e.direction,
        steps: [],
      });
      continue;
    }
    if (e.kind === "migration-done") continue;
    let g = groups[groups.length - 1];
    if (!g || g.migrationId !== e.migrationId) {
      g = { migrationId: e.migrationId, direction: "up", steps: [] };
      groups.push(g);
    }
    if (e.kind === "step-start") {
      g.steps.push(stepOf(e));
      continue;
    }
    const inFlight = [...g.steps]
      .reverse()
      .find((s) => s.summary === e.summary && s.status === "running");
    if (inFlight) {
      inFlight.status = e.status;
      if (e.error !== undefined) inFlight.error = e.error;
      if (e.warning !== undefined) inFlight.warning = e.warning;
    } else {
      g.steps.push(stepOf(e));
    }
  }
  return groups;
}

/**
 * Admin panel listing every defined migration with its applied/pending status and
 * link actions to migrate to any point. Pass a `Migrator` (consumer context +
 * `useSharePointSchema(spfxContext)` from `@speel/pnpjs` + the generated `migrations`
 * array).
 *
 * Renders through the skin, so an admin page matches the site it administers. Needs a
 * `SpeelUIProvider` (skin only) or a `SpeelProvider` above it.
 */
export function MigrationsManager({
  migrator,
  title = "Schema migrations",
  onApplied,
}: MigrationsManagerProps): React.ReactElement {
  const ui = useSpeelUI();
  const [status, setStatus] = React.useState<MigrationsStatus | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{
    id: string;
    plan: MigrationsPlan | null;
  } | null>(null);
  const [events, setEvents] = React.useState<readonly MigrationsEvent[]>([]);
  const groupOpen = React.useRef(false);
  const logBox = React.useRef<HTMLDivElement>(null);

  const refresh = React.useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setStatus(await migrator.status());
    } catch (e) {
      setError(messageOf(e));
    }
  }, [migrator]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // The devtools console gets the same run, grouped per migration — an admin who
  // hits a hang copies a real transcript out of it, not a screenshot of a spinner.
  const endGroup = React.useCallback((): void => {
    if (!groupOpen.current) return;
    groupOpen.current = false;
    console.groupEnd();
  }, []);

  const mirror = React.useCallback(
    (e: MigrationsEvent): void => {
      if (e.kind === "migration-start") {
        endGroup();
        console.group(headingOf(e.direction, e.migrationId));
        groupOpen.current = true;
        return;
      }
      if (e.kind === "migration-done") {
        endGroup();
        return;
      }
      const step = stepOf(e);
      if (step.status === "failed") console.error(lineOf(step));
      else if (step.warning !== undefined)
        console.warn(`${lineOf(step)}\n${warningLineOf(step.warning)}`);
      else console.log(lineOf(step));
    },
    [endGroup],
  );

  const run = React.useCallback(
    async (op: (progress: MigrationProgress) => Promise<MigrationResult>) => {
      setBusy(true);
      setError(null);
      setEvents([]); // this run's output, not the last one's
      try {
        const result = await op({
          onProgress: (e) => {
            mirror(e);
            setEvents((prev) => [...prev, e]);
          },
        });
        onApplied?.(result);
        await refresh();
      } catch (e) {
        setError(messageOf(e));
      } finally {
        // A failed run never sends migration-done, so the group is closed here
        // too — otherwise every later log would nest inside a dead run.
        endGroup();
        setBusy(false);
      }
    },
    [endGroup, mirror, onApplied, refresh],
  );

  const groups = React.useMemo(() => groupEvents(events), [events]);

  // Follow the tail: the step in flight is always the one on screen.
  React.useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [events]);

  const applied = status?.applied ?? [];
  const pending = status?.pending ?? [];
  const appliedSet = new Set(applied);
  const all = [...applied, ...pending].sort(); // every migration, in id order (applied is a prefix)
  const currentIndex = applied.length - 1; // the latest-applied migration (the current state)

  // Migrate to a target — up for a pending row, down (confirmed) for an earlier-applied row.
  const goTo = React.useCallback(
    (id: string, down: boolean): void => {
      if (down) {
        const ok =
          typeof window === "undefined" ||
          window.confirm(
            `Restore to "${id}"? This rolls back every migration applied after it — dropping their columns (dropped lists go to the site recycle bin).`,
          );
        if (!ok) return;
      }
      void run((p) => migrator.migrateTo(id, p));
    },
    [migrator, run],
  );

  // Plan on demand — annotation costs one schema read per operation.
  // The preview mirrors what this row's action would do: both Apply and Restore
  // call migrateTo(id), so `{ to }` yields the up steps for a pending row and the
  // down steps for an earlier-applied one. The current row has no action to
  // mirror, so it previews its own operations instead.
  const openPreview = React.useCallback(
    async (id: string, isCurrent: boolean): Promise<void> => {
      if (!migrator.plan) return;
      setPreview({ id, plan: null });
      setError(null);
      try {
        const plan = await migrator.plan(
          isCurrent ? { only: id, annotate: true } : { to: id, annotate: true },
        );
        setPreview({ id, plan });
      } catch (e) {
        setPreview(null);
        setError(messageOf(e));
      }
    },
    [migrator],
  );

  // The preview's Apply — the same migrateTo the row's Apply link makes, which is
  // the call the preview was generated from, so it runs exactly what it showed.
  const applyPreviewed = React.useCallback(
    (id: string): void => {
      setPreview(null);
      void run((p) => migrator.migrateTo(id, p));
    },
    [migrator, run],
  );

  const markApplied = React.useCallback(
    async (id: string): Promise<void> => {
      if (!migrator.markApplied) return;
      setBusy(true);
      setError(null);
      try {
        await migrator.markApplied(id);
        setPreview(null);
        await refresh();
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setBusy(false);
      }
    },
    [migrator, refresh],
  );

  return (
    <div style={{ ...stack(12), maxWidth: 560 }}>
      <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
        {title}
      </h3>

      {error && (
        <ui.MessageBar intent="error" onDismiss={() => setError(null)}>
          {error}
        </ui.MessageBar>
      )}

      {status === null && error === null ? (
        <ui.Spinner label="Loading status…" />
      ) : status ? (
        <div style={stack(8)}>
          <span>
            {applied.length} of {all.length} applied
            {pending.length ? ` · ${pending.length} pending` : ""}
          </span>

          {all.length === 0 ? (
            <span style={{ color: ACCENT.muted }}>No migrations defined.</span>
          ) : (
            <div style={stack(6)}>
              {all.map((id, index) => {
                const isApplied = appliedSet.has(id);
                const isCurrent = isApplied && index === currentIndex;
                return (
                  <div key={id} style={rowOf(8)}>
                    <span
                      style={{
                        width: 14,
                        color: isApplied ? ACCENT.ok : ACCENT.faint,
                      }}
                    >
                      {isApplied ? "✓" : "○"}
                    </span>
                    <span style={{ fontFamily: "monospace", flexGrow: 1 }}>
                      {id}
                    </span>
                    <span
                      style={{ color: isApplied ? ACCENT.ok : ACCENT.muted }}
                    >
                      {isApplied ? "Applied" : "Pending"}
                    </span>
                    {migrator.plan && (
                      <ui.IconButton
                        iconName="RedEye"
                        title={`Preview ${id}`}
                        disabled={busy}
                        onClick={() => void openPreview(id, isCurrent)}
                      />
                    )}
                    {isCurrent ? (
                      <span style={{ color: ACCENT.faint, minWidth: 56 }}>
                        current
                      </span>
                    ) : (
                      <span style={{ minWidth: 56 }}>
                        <ui.Button
                          text={isApplied ? "Restore" : "Apply"}
                          appearance="subtle"
                          disabled={busy}
                          onClick={() => goTo(id, isApplied)}
                        />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <hr
            style={{
              border: 0,
              borderTop: `1px solid ${ACCENT.rule}`,
              margin: 0,
              width: "100%",
            }}
          />

          <div style={rowOf(8)}>
            <ui.Button
              text={
                pending.length
                  ? `Apply ${pending.length} pending`
                  : "Up to date"
              }
              appearance="primary"
              disabled={busy || pending.length === 0}
              onClick={() => void run((p) => migrator.migrate(p))}
            />
            <ui.Button
              text="Refresh"
              appearance="secondary"
              disabled={busy}
              onClick={() => void refresh()}
            />
            {busy && <ui.Spinner label="Working…" />}
          </div>

          {groups.length > 0 && (
            <div
              role="log"
              ref={logBox}
              style={{
                maxHeight: 180,
                overflowY: "auto",
                padding: "8px 10px",
                background: ACCENT.surface,
                border: `1px solid ${ACCENT.rule}`,
                fontFamily: "Consolas, Menlo, monospace",
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {groups.map((g) => (
                <div key={`${g.migrationId}-${g.direction}`}>
                  <div style={{ color: ACCENT.ink, fontWeight: 600 }}>
                    {headingOf(g.direction, g.migrationId)}
                  </div>
                  {g.steps.map((step, i) => (
                    <div
                      key={`${step.summary}-${i}`}
                      style={{ paddingLeft: 12 }}
                    >
                      <div style={{ color: COLOR_OF[step.status] }}>
                        {lineOf(step)}
                      </div>
                      {step.warning !== undefined && (
                        <div style={{ color: ACCENT.warn, paddingLeft: 12 }}>
                          {warningLineOf(step.warning)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {preview && (
        <MigrationPreviewPanel
          migrationId={preview.id}
          plan={preview.plan}
          onDismiss={() => setPreview(null)}
          {...(!appliedSet.has(preview.id)
            ? { onApply: () => applyPreviewed(preview.id) }
            : {})}
          {...(migrator.markApplied && !appliedSet.has(preview.id)
            ? { onMarkApplied: () => void markApplied(preview.id) }
            : {})}
        />
      )}
    </div>
  );
}
