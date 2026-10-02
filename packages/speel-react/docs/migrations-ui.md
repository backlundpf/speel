# Migrations UI

## What & when

`MigrationsManager` is an admin panel that lists every defined migration in id order with
its Applied/Pending status, and lets an admin apply or restore the schema to any point with
a single click. It renders in your skin, so it looks like the rest of the site. Import it from the `@speel/react/migrations`
subpath. Reach for it when you need an in-browser admin surface for `@speel/migrations` —
typically a dedicated admin web part or a settings panel in your SPFx project.

## Canonical example

```tsx
import { SpeelUIProvider } from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import { MigrationsManager } from "@speel/react/migrations";
import { Migrator } from "@speel/migrations";
import { useSharePointSchema } from "@speel/pnpjs";
import { migrations } from "./migrations"; // generated index
import { MyContext } from "./speel/MyContext";

function AdminPanel({
  spfxContext,
  ctx,
}: {
  spfxContext: WebPartContext;
  ctx: MyContext;
}) {
  const migrator = new Migrator({
    context: ctx,
    schema: useSharePointSchema(spfxContext),
    migrations,
  });

  return (
    <SpeelUIProvider ui={fluentV8Adapter}>
      <MigrationsManager
        migrator={migrator}
        title="Schema migrations"
        onApplied={(result) => console.log("ran", result.ran)}
      />
    </SpeelUIProvider>
  );
}
```

See [`../../speel-migrations/docs/runtime.md`](../../speel-migrations/docs/runtime.md)
for `Migrator` construction, the three runtime methods, history tracking, and rollback
semantics.

## Capabilities

### Props

`MigrationsManager` accepts three props:

- **`migrator`** — a `MigrationsRunner`-shaped object (structurally typed, so a real
  `Migrator` from `@speel/migrations` satisfies it without an explicit import into
  `@speel/react`). Must expose `status()`, `migrate()`, and `migrateTo(targetId)`, and may
  expose `plan(options?)` and `markApplied(id)` — each optional member lights up a feature
  described below. The panel passes a progress collector as the last argument of `migrate`
  and `migrateTo`; a runner that ignores it still drives the panel, minus the run output.
- **`title`** — heading text rendered above the list. Default `'Schema migrations'`.
- **`onApplied`** — optional callback called after a successful apply or restore,
  receiving a `MigrationResult` (`{ direction: 'up' | 'down'; ran: string[] }`).

### What the panel shows

On mount the panel calls `migrator.status()` and displays a spinner while loading. Once
loaded it shows:

- A summary line: `N of M applied · K pending` (or `N of M applied` when up to date).
- An id-ordered list of all migrations. Each row shows a checkmark (green, Applied) or
  open circle (grey, Pending), the migration id in monospace, the Applied/Pending label,
  and either a **current** marker (for the latest applied migration) or an **Apply**
  (pending) / **Restore** (earlier applied) link.
- A **Apply N pending** primary button (disabled when up to date) and a **Refresh** button.
- A spinner during any in-flight operation, and beneath it the run output described below.
- An inline error bar if `status()` or a migration operation throws, with a dismiss button.

Clicking a row's link calls `migrator.migrateTo(id)` — either applying up to that
point or rolling back down to it.

### Run output

Applying or restoring streams the run into a log box under the buttons, so a long apply reads as
progress rather than as a spinner that means both "working" and "hung". Lines are grouped by
migration — `Applying <id>` / `Reverting <id>` — with one line per operation beneath it:

```
Applying 20260608T1816_InitialSchema
  ✓ Create list "Projects"
  … Add field DueDate (DateTime) to "Projects"
  ↷ Create list "Programs" — already there
  ✗ Index field Owner on "Projects" — Field not found
  ✓ Alter field Notes (Text) on "Projects"
    ⚠ May lose data: Converting Notes from Note to Text truncates existing values to 255 characters.
```

A step appears with `…` the moment it goes out and flips to its result when the response lands.
Because operations are sent a wave at a time, a whole wave shows as in flight together — which is
what names the step that is stuck when something hangs. The box follows the tail, keeps the last
run visible after it finishes, and clears when the next run starts. A step that may lose data — a
narrowing type change such as Note → Text — carries a `⚠ May lose data` line under it, in the
warning accent, from the moment it goes out; the step still runs.

The same lines are mirrored to the devtools console, wrapped in a `console.group` per migration
(failures go to `console.error`, data-loss warnings to `console.warn`), so an admin who hits a hang can copy out a transcript instead of
screenshotting a spinner. It is always on — there is no prop — and the panel closes its own group
when a run throws, since a failed run never reports a migration as done.

The events behind all of this come from `@speel/migrations` — see
[`../../speel-migrations/docs/runtime.md`](../../speel-migrations/docs/runtime.md) for the stream
itself, and pass your own `onProgress` there if you are driving a `Migrator` without this panel.

### Dry-run preview

When the runner exposes `plan()`, each row gains a preview (eye) button that shows **what that
row's action would do**. Apply and Restore both call `migrateTo(id)`, so the preview calls
`plan({ to: id, annotate: true })` — the up steps for a pending row, the **down steps** for an
earlier-applied one (Restore rolls back everything after it, so those steps come from the later
migrations). The current row has no action, so it previews its own operations with
`plan({ only: id })`, all marked skipped.

It opens `MigrationPreviewPanel` — a `SpeelPanel`, so it carries the same chrome as every
other surface in the library: resizable from its inner edge, light-dismissable, its actions
in the footer. It lists the operations with, per step, a plain-language summary, its
direction, whether it **will run** or is **skipped**, its live presence on the site (already
present / not present / unverifiable), a **destructive** badge on `dropList` /
`dropField`, and a **may lose data** badge with the reason on an `alterField` that narrows a
column's type. When the plan spans several migrations, each step is labelled with the migration
it came from.

The default view is the steps that will run; a **Show all steps** checkbox reveals the rest,
which is how you read an already-applied migration (there, nothing runs). Custom `run`
steps render their label and source, marked as effects-unknown.

The panel is exported separately as `MigrationPreviewPanel` if you want to drive it yourself; its
`onApply` and `onMarkApplied` props are what render the two footer actions.

### Apply from the preview

When the previewed migration is pending, the panel's footer carries an **Apply** primary button
that runs exactly what the preview just showed — the same `migrateTo(id)` the row's Apply link
calls — then closes the panel and refreshes the status. There is no confirmation: applying
forward is the safe direction, and only Restore asks. An already-applied migration gets no Apply
button; its action is Restore, which stays on the row.

### Mark applied

When the runner also exposes `markApplied()` and the previewed migration is pending, the
panel offers **Mark applied** — recording the migration without running it, for a baseline
whose schema already exists on the site. If any step that would run is not already present
(including steps that cannot be verified at all), a warning bar appears and clicking through
requires a `window.confirm`. The warning counts only the previewed migration's own steps, since
that is all Mark applied records — a plan spanning several migrations does not warn on the
others. A migration whose every step reads already-present marks
applied without further ceremony.

### The skin, and where it comes from

`MigrationsManager` renders through the `SpeelUIAdapter` like every other component here,
so an admin page matches the site it administers rather than showing Fluent chrome inside
a differently-skinned app. It therefore needs the skin in context.

Inside an app that already mounts a `SpeelProvider`, that is all it takes. A standalone
admin web part usually has no data context to give one, so **`SpeelUIProvider`** supplies
the adapter alone:

```tsx
<SpeelUIProvider ui={fluentV8Adapter}>
  <MigrationsManager migrator={migrator} />
</SpeelUIProvider>
```

The status colours the adapter has no vocabulary for — applied, destructive, may lose data, the muted
gutter of a step that will not run — read from `--speel-accent-*` custom properties and
fall back to the Fluent palette, so a themed host can reach them without a fork.

> Stability: still settling. The structural `MigrationsRunner` interface may gain
> additional methods as the migrations runtime evolves.

## Boundaries & gotchas

- **Restore triggers a confirm dialog.** Clicking a **Restore** link on an already-applied
  migration calls `window.confirm` before proceeding. The confirm message names the target
  id and warns that columns are dropped (lists go to the recycle bin). This is intentional
  — you cannot suppress it from the props.

- **It throws without a skin above it.** `MigrationsManager` and `MigrationPreviewPanel`
  both read the adapter from context, so a bare mount fails with _useSpeelUI must be used
  within a `<SpeelProvider>`_. Wrap it in `SpeelUIProvider` (or mount it inside the app's
  existing `SpeelProvider`). Earlier versions imported Fluent directly and needed neither.

- **Admin framing.** `MigrationsManager` is intentionally minimal: no pagination, no
  filtering, no bulk-select. It is designed to sit in an admin web part or settings panel
  visited by a site owner, not in the main application UI.

- **`plan` and `markApplied` are optional.** A runner without them still drives the panel
  fully — the preview button and Mark applied action simply do not render. Nothing else
  changes.

- **Presence is existence-only.** "already present" means the list or field exists, not that
  its type or settings match the migration's spec. Index operations and custom `run` steps
  cannot be checked at all and read as "unverifiable" — which is also why they count toward
  the Mark applied warning.

- **The first preview on a fresh site writes.** `plan()` calls `bootstrap()` like `status()`
  does, creating `SpeelMigrationsHistory` if absent. On production, open the page knowing
  that.

- **The run output is not a record.** It lives in component state: it clears when the next run
  starts and dies with the panel. The devtools console keeps its copy for as long as the tab is
  open; nothing is written anywhere else.

- **Migrator construction is caller's responsibility.** The panel drives the `migrator`
  you pass in; it never constructs one itself. Build the `Migrator` in your web part's
  `onInit` or at render time (it is lightweight — no network calls until `status()` is
  called). Pass a stable reference to avoid spurious re-fetches.
