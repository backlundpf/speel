# Surfaces

## What & when

`@speel/react` provides two surface shapes — a centered `SpeelModal` (dialog) and a
side-drawer `SpeelPanel` — each usable declaratively (JSX props) or imperatively
(awaited `showForm`). The imperative path is idiomatic for CRUD workflows: call
`showForm`, await the result, and react to `action === 'submit'` without managing
`open`/`onOpenChange` state or ref-binding the form yourself. Reach for the declarative
path when the surface's open state is already managed by other component logic.

## Canonical example

```tsx
import { useOverlays, type FormSection } from "@speel/react";
import { Project } from "../entities/Project";

const SECTIONS: FormSection[] = [
  { title: "Basics", fields: ["Title", "Status", "DueDate"] },
  { title: "Team", fields: ["Owner", "Reviewers"] },
];

function ProjectsView() {
  const { toast, showForm } = useOverlays();

  const createProject = async () => {
    const { action } = await showForm({
      surface: "modal",
      title: "New project",
      entity: new Project(),
      mode: "create",
      sections: SECTIONS,
    });
    if (action === "submit") toast.success("Project created");
  };

  const editProject = async (p: Project) => {
    const { action } = await showForm({
      // default surface is 'panel'
      title: `Edit: ${p.Title ?? ""}`,
      entity: p,
      mode: "edit",
      sections: SECTIONS,
    });
    if (action === "submit") toast.success("Project saved");
  };
  // ...
}
```

## Capabilities

### Imperative API — `useSurfaces` / `useOverlays`

**`useSurfaces()`** returns a `SurfaceApi` with three methods:

```ts
showForm<T>(opts: FormRequest<T>): Promise<SurfaceResult<T>>
showDocumentForm<T extends SpeelDocument>(opts: DocumentFormRequest<T>): Promise<SurfaceResult<T>>
confirm(opts: ConfirmRequest): Promise<boolean>
```

`FormRequest` accepts `surface` (`'modal'` | `'panel'`, default `'panel'`), the form inputs
(`title`, `entity`, `mode`, `sections`, `fields`, `exclude`, `beforeSubmit`, `onSubmit` —
see the forms page) and every chrome prop below, `style` included.

**`showDocumentForm`** hosts the document form for `SpeelDocument` entities: a
required file input with upload progress in create mode (plus an `accept` filter),
the stored-file link otherwise. The promise semantics are identical, so an
upload-and-refresh flow is one await:

```ts
const { action } = await showDocumentForm({
  surface: "modal",
  title: "Add artifact",
  entity: new ProjectArtifact(),
  mode: "create",
});
if (action === "submit") reloadTable();
```

`SurfaceResult` resolves to `{ action: 'submit' | 'cancel'; entity: T }`. The promise
settles when the surface closes: `action` is `'submit'` only after a successful
`saveChangesAsync`; any dismissal, cancel button, or backdrop click resolves `'cancel'`.
The surface is automatically removed from the DOM after settling.

Multiple concurrent `showForm` calls stack — each renders its own surface and settles
independently. The `SurfaceManager` (mounted inside `SpeelProvider`) owns the stack.

**`confirm`** is the app-wide yes/no: a small modal that fits its message, with no resize,
drag or fullscreen chrome. It resolves `true` on the confirm button and `false` on Cancel,
Escape, the close button or a click outside. It opens on Cancel, so Enter alone never
confirms; it is named by its `title` and described by its `message`.

```ts
const ok = await confirm({
  title: "Delete item?",
  message: "This cannot be undone.",
  confirmText: "Delete",
  destructive: true,
}); // danger-styled confirm button
```

**`useOverlays()`** combines `SurfaceApi`, `ToastApi`, and `ActiveTasksApi` in one import:
`const { showForm, toast, tasks } = useOverlays()`. This is the idiomatic single import
for CRUD pages — see [feedback.md](feedback.md) for `toast` and `tasks` details.

### Declarative surfaces — `SpeelModal` / `SpeelPanel`

When you need to control the open state explicitly, use the JSX components:

```tsx
import { SpeelModal, SpeelPanel, useDisclosure } from "@speel/react";

function ProjectDetail({ project }) {
  const modal = useDisclosure();

  return (
    <>
      <button onClick={modal.show}>Edit</button>
      <SpeelModal
        open={modal.open}
        onOpenChange={modal.hide}
        title="Edit project"
        entity={project}
        mode="edit"
        onSaved={() => {
          modal.hide();
          reload();
        }}
      />
    </>
  );
}
```

**`useDisclosure(initial?)`** returns `{ open, show(), hide(), toggle() }` — simple
controlled state for a single surface. Use it when a button in the same component
toggles the surface and you do not need an awaited result.

Both `SpeelModal` and `SpeelPanel` accept either a **form variant** (`entity` / `mode`
props — see below) or a **content variant** (`children` / optional `actions`). Common
props across both variants: `open`, `onOpenChange`, `title`, `blocking`, `size`
(`'small' | 'medium' | 'large'`), `resizable`, `style`.

The content variant's `actions` is the library's one actions shape: an array of
`SpeelAction`s rendered as the skin's buttons, or any node rendered as-is in the footer
slot — status text, a spinner, a "don't ask again" checkbox. A destructive action takes
`appearance: "danger"`; `align: "start"` moves an action to the far end of a split footer.
For a plain yes/no, `confirm()` above already does all of this.

`SpeelModal` additionally accepts `draggable`, `fullscreenToggle` and `defaultFullscreen`.
`SpeelPanel` additionally accepts `position` (`'start' | 'end'`).

All of it is declared once, in `surfaceProps.ts`: `SurfaceChromeProps` and its panel and
modal extensions, plus the two variants. `SpeelModal`, `SpeelPanel`, `SurfaceForm` and
`showForm`'s `FormRequest` compose those rather than restating them, so a prop added to
the chrome reaches every surface and both variants at once.

### Surface chrome

Modals default to resizable, draggable, and showing a fullscreen toggle;
`defaultFullscreen` opens one maximized without taking the toggle away. Panels default to
resizable from the edge. Pass `resizable={false}`, `draggable={false}`, or
`fullscreenToggle={false}` to opt out. A `blocking` surface suppresses the close button
and backdrop dismiss — use it when saving must complete before the user can proceed.

**Size and placement: `style`.** Every surface takes `style` — CSS lengths in strings, and
only these keys: `width` and `maxWidth` (both surfaces), `height`, `maxHeight`, `top` and
`left` (modal only). `width`/`height` replace what `size` sets; caps yield to the screen
(a modal never passes 96vw × 92vh). `height: "auto"` fits the content, growing and
shrinking with it — centred, or downward only when `top` is set — until the cap, then the
body scrolls. A placed modal keeps its `top`/`left` and shortens to the room left; only
below the built-in floor does it move back to stay on screen. Once the user drags or
resizes a modal it keeps the size they gave it, and auto height ends for that modal.

**Every surface has a name.** A modal or panel is named by its `title`; an untitled one takes
`ariaLabel` (every surface prop bag and `showForm` accept it), read by screen readers and not
painted. One with neither is announced as just "dialog", and the skins warn about it once in
development. Close buttons are named "Close".

A panel's resize edge is a hairline rule that thickens on hover or keyboard focus, over a
grab target wide enough to hit. It is a focusable `separator`: the arrow keys move it a
step at a time, in whichever direction widens the panel from the edge it is docked to. The
drag itself tracks pointer events, so a touch or pen resizes as a mouse does, and the width
is clamped to the viewport less a visible strip — a panel dragged past the edge would take
its own handle with it. Panel width is per-mount state: it survives an open/close cycle
while the component stays mounted, and resets on reload.

A modal's corner grip works the same way: it lights up on hover or focus, is a named tab
stop the arrow keys resize, and takes touch and pen as well as a mouse. The title bar drags
the modal by pointer only; there is no keyboard move, since repositioning a centered modal
is cosmetic and the keyboard already has resize and the fullscreen toggle. Both the drag
and the resize stop at the viewport edges, so a modal cannot be pushed off screen or grown
past it.

**Focus comes back without moving the page.** Closing a panel or modal returns focus to what
had it when the surface opened, with `preventScroll` — never to `body`, never to an element
that has since left the page, and never away from somewhere the user moved focus. A surface
opened from a click on a plain row (which never takes focus) therefore leaves the scroll
position alone. `returnFocus` names another target — an element, or a function called at close
(the list, after a panel deleted its own row) — or `false` to leave focus to you; `showForm`
takes it too.

`useResizable` (panel edge) and `useModalFrame` (a modal's size, placement, corner and title
bar; it supersedes the deprecated `useDragResize`) are exported for your own skin's chrome.
Their handle props carry the role, the tab stop, and the pointer and key handlers.

> Stability: still settling. Chrome defaults (which features are on by default) are
> implemented in the `fluentV8Adapter` skin and may be adjusted before 1.0.

### Forms inside surfaces — `SurfaceForm`

When `entity` is passed, both `SpeelModal` and `SpeelPanel` delegate to `SurfaceForm`
internally, which mounts one `useEntityForm` feeding the body and footer slots. The form
body, field set, sections, and submit/cancel/edit-mode footer are the same as inline
`SpeelForm` — see [forms.md](forms.md) for `sections` and `beforeSubmit`, and
[fields.md](fields.md) for field rendering and `EntityFields`. The `onSaved` callback (declarative variant) is called after a
successful save; `closeOnSave` (default `true`) closes the surface automatically.
`allowEdit` (also on `showForm` / `showDocumentForm` requests) turns a `mode="view"`
surface into a read-only display form: Close only, no Edit.

## Boundaries & gotchas

- **`SpeelProvider` is required.** Both hooks (`useSurfaces`, `useOverlays`) and the
  declarative components (`SpeelModal`, `SpeelPanel`) require the provider. The surface
  hosts and the `SurfaceCtx` are mounted by `SpeelProvider` unconditionally.

- **A skin-only provider exists.** `SpeelProvider` needs a `DbContext`. A surface that
  renders chrome but reads no data — the migrations admin UI is the one in this package —
  can take `SpeelUIProvider` instead, which supplies the adapter alone.

- **Awaiting `showForm` vs. `onSaved`.** The imperative path settles the promise on
  close, not on save — there is a brief window between `saveChangesAsync` completing and
  the surface unmounting. The `entity` in `SurfaceResult` is the instance passed in (with
  draft values applied), not a freshly fetched copy.

- **SPFx layering.** Surfaces render inside Fluent v8's `Layer` portal. The `@speel/react`
  overlay stack (`Z.blockingTasks`, `Z.runningTasks`, `Z.toasts`) is tuned to sit above
  the Fabric `Layer` z-index. If your SPFx page injects portals at custom z-indexes,
  align against the layer constants documented in [setup.md](setup.md).

- **Content variant needs `children`.** If neither `entity` nor `children` is passed,
  TypeScript will reject the JSX — the props type is a discriminated union.

- **An array of elements is a node, not actions.** `actions` is read as an action array
  only when every entry is a plain `{ key, text }` object; `[<Button />]` renders as-is.
  Under React 17's typings `ReactNode` admits any object, so an action missing `text` is
  not a type error — it fails at render, as a plain object passed as a child.
