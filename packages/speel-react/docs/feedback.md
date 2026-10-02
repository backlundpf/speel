# Feedback

## What & when

`@speel/react` provides two complementary feedback surfaces: **toasts** for transient
confirmations and error messages, and **active tasks** for tracking the progress of
long-running async operations. Both are portal-rendered and available anywhere under
`SpeelProvider` — no extra setup beyond the provider itself. Reach for `useToast` when
you need a fire-and-forget confirmation after a save; reach for `useActiveTasks` when
an operation takes long enough that the user needs to see it running.

## Canonical example

```tsx
import { useOverlays } from "@speel/react";

function ProjectActions({ project, ctx }) {
  const { toast, tasks } = useOverlays();

  const saveChanges = async () => {
    await tasks.run(() => ctx.saveChangesAsync(), {
      label: "Saving project…",
      blocking: true,
    });
    toast.success("Project saved");
  };

  const deleteProject = () => {
    ctx.set(Project).remove(project);
    tasks
      .run(() => ctx.saveChangesAsync(), {
        label: "Deleting project…",
        blocking: true,
      })
      .then(() => {
        toast.success("Project deleted");
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : String(e), {
          title: "Delete failed",
        }),
      );
  };

  return (
    <>
      <button onClick={saveChanges}>Save</button>
      <button onClick={deleteProject}>Delete</button>
    </>
  );
}
```

`useOverlays()` is the idiomatic single import for CRUD pages — it combines `toast`,
`tasks`, and `showForm` in one call (see [surfaces.md](surfaces.md) for `showForm`).

## Capabilities

### Toast API — `useToast`

`useToast()` returns a `ToastApi`: a callable function `toast(options)` with four
convenience methods — `toast.success`, `toast.error`, `toast.warning`, `toast.info` —
each taking `(message, options?)`. All return the toast id (a string), which you can
pass to `toast.dismiss(id)` to remove it early.

`ToastOptions` controls: **`intent`** (`'info' | 'success' | 'warning' | 'error'`),
**`title`** (bold prefix), **`message`** (any `ReactNode`), **`duration`** (ms before
auto-dismiss; `null` makes it sticky; omit to use the provider default of 6 000 ms),
**`dismissible`** (default `true` — shows the dismiss button), **`position`** (where the
toast appears — overrides the provider default for that toast), and **`size`**
(`'normal'` ≤ 360 px or `'wide'` ≤ 560 px; default `'normal'`).

**Positions.** Seven positions are supported: `'top-right'` (provider default),
`'top-left'`, `'top-center'`, `'bottom-right'`, `'bottom-left'`, `'bottom-center'`,
and `'center'`. Toasts at different positions render in independent stacks and do not
interfere. Per-toast `position` lets you use the wide center placement for banner-style
messages while other toasts continue to appear top-right.

**No separate notification API.** There is no distinct `useNotification` hook or
notification center. The banner/notification use case is covered by `toast` with
`size: 'wide'`, a center position, and `duration: null` (sticky), plus custom
`message` content (including action buttons that call `toast.dismiss(id)`).

**`ToastProvider` defaults** are configurable via `SpeelProvider`'s `config.toast`
prop: `{ position: 'top-right', duration: 6000 }`.

### Active tasks API — `useActiveTasks`

`useActiveTasks()` returns an `ActiveTasksApi` with two methods:

**`tasks.run(work, opts)`** is the primary path: pass an async factory and an options
object; the library creates the task, calls `work`, and calls `done()` or `fail()`
automatically. It re-throws on failure so `await`/`.catch()` works normally.

**`tasks.begin(opts)`** gives you a `TaskHandle` for manual control: call
`handle.update({ label, progress })` to push progress (a 0–1 number drives a
determinate bar), `handle.done()` when finished, or `handle.fail(error)` on error.
Tasks linger for 3 seconds after completion so the user sees the terminal state.

`TaskOptions` accepts `label` (display text), `blocking` (default `false`), and
`expectedMs` (default 10 000 ms — after this elapses without an `update`, the task
transitions to `'aging'` state, which resets on the next `update`). Completed and
failed tasks persist in the UI for ~3 seconds before removing themselves.

**What the UI shows.** Non-blocking tasks appear in a fixed bottom-right stack
(320 px card). A `blocking: true` task that is still running renders a full-screen
dark overlay instead, with the task label centered — preventing all user interaction
until the work completes. Both show a progress bar only when `progress` has been set
via `handle.update`.

**What blocking holds still.** Not just the pointer: while any blocking task runs, the
rest of the page is `inert` (with `aria-hidden` standing in where a browser lacks
`inert`), key events aimed at it are stopped, and focus moves into the overlay's status
region, so Enter on the button that started a save cannot start a second one. The
overlay is an `alertdialog` with `aria-busy`, labelled by that status region. When the
last blocking task ends, focus returns to the element that held it — if it is still on
the page. The scope is every layer on `document.body`, not only your component tree, so
an open modal or panel (Fluent and Radix both portal to the body) is covered too, and a
layer opened mid-task is sealed as it appears. Toasts and the running-task stack sit
above the scrim and stay reachable.

### Provider nesting and `SpeelProvider`

`ToastProvider` and `ActiveTasksProvider` are mounted **unconditionally inside
`SpeelProvider`** — you do not add them yourself. Both hooks (`useToast`,
`useActiveTasks`) and the combined `useOverlays` work anywhere under a single
`SpeelProvider`. Do not nest them manually.

## Boundaries & gotchas

- **`SpeelProvider` is required.** `useToast` throws if called outside a
  `<ToastProvider>`, and `useActiveTasks` throws if called outside an
  `<ActiveTasksProvider>`. Both are mounted by `SpeelProvider`, so ensure the provider
  wraps your component tree before using either hook. See [setup.md](setup.md).

- **`tasks.run` re-throws.** If the work function rejects, `tasks.run` marks the task
  `'failed'` and re-throws. Either `await` and catch, or attach a `.catch()` — failing
  to handle the rejection will produce an unhandled promise rejection in the console.

- **Blocking overlays stack with surfaces.** A `blocking: true` task renders at
  `Z.blockingTasks` (2 000 000), which sits above Fluent v8's Layer portal (~1 000 000)
  and above modals/panels. If you open a surface and then trigger a blocking task,
  the overlay covers the surface. See [setup.md](setup.md) for the full layer stack.

- **A blocking task blocks the whole page.** The inert scope is the body, so in a host
  with several Speel apps (several web parts on one page) a blocking task in one holds
  the others still too — as its full-screen scrim already does for the pointer. Keep
  `blocking` for work the user must wait on. Progress updates inside a blocking overlay
  are not announced live (`aria-busy`); the label is read when focus lands on it.

- **Overlays portal to `document.body` and adopt the host font by measurement.**
  Toast stacks and task surfaces render outside your styled containers, on a body the
  host page may leave unstyled (SharePoint's body computes to the browser serif
  default). Each provider measures the `font-family` at its own position in the tree
  and carries it on the portaled containers — so overlays match the page your app
  renders in, not the bare body. Where nothing is measurable (SSR), no font is set.

- **Sticky toasts with actions.** When a sticky toast (`duration: null`) contains
  action buttons, close it explicitly via `toast.dismiss(id)` from within the button
  handler. Assign the id returned by `toast.info(...)` before constructing the message
  (`let id = ''; id = toast.info(<... onClick={() => toast.dismiss(id)} ...>)`) to
  avoid a use-before-define issue.
