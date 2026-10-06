# Forms

## What & when

`@speel/react` provides a model-driven form layer on top of `@speel/core`'s form-state
primitives: field state predicates, validation rules, and the `FieldContext` shape are
all defined in core and documented in [`../../speel-core/docs/forms.md`](../../speel-core/docs/forms.md).
This page covers the React-specific surface — `useEntityForm`, `SpeelForm`,
`SpeelField`, `EntityFields`, and the headless hooks. Reach here when you are building
or customising an entity form inside an SPFx web part.

## Canonical example

```tsx
import { useOverlays, type FormSection } from "@speel/react";
import { Project } from "../entities/Project";

const SECTIONS: FormSection[] = [
  { title: "Basics", fields: ["Title", "Status", "Priority", "DueDate"] },
  { title: "Team", fields: ["Owner", "Reviewers"] },
  { title: "Details", fields: ["Budget", "Description"] },
];

function ProjectsView() {
  const tableRef = React.useRef(null);
  const { toast, showForm } = useOverlays();

  const createProject = async () => {
    const { action } = await showForm({
      surface: "modal",
      title: "New project",
      entity: new Project(),
      mode: "create",
      sections: SECTIONS,
    });
    if (action === "submit") {
      toast.success("Project created");
      tableRef.current?.reload();
    }
  };

  const editProject = async (p: Project) => {
    const { action } = await showForm({
      title: `Edit: ${p.Title ?? ""}`,
      entity: p,
      mode: "edit",
      sections: SECTIONS,
    });
    if (action === "submit") {
      toast.success("Project saved");
      tableRef.current?.reload();
    }
  };

  // ...render table with rowActions
}
```

The imperative `showForm` path (`useOverlays` / `useSurfaces`) is the idiomatic way to
open entity forms in modal or panel overlays — see the surfaces page for that seam.
This page focuses on the form primitives themselves.

## Capabilities

### `useEntityForm` — the form controller

`useEntityForm(entity, mode?, options?)` wires a `@speel/core` entity to TanStack Form.
It returns an `EntityForm` handle with the following consumer-visible members:

- **`form`** — the underlying TanStack `AnyFormApi`, for accessing raw field state when
  needed.
- **`et`** — the `EntityType` from the model, used by field components for metadata.
- **`entity`** — the tracked entity instance.
- **`mode`** — the `FormMode` (`'create' | 'edit' | 'view'`).
- **`touched`** — a `Record<string, boolean>` tracking which fields the user has
  interacted with (managed separately from TanStack's own registration).
- **`canSubmit`** — is the draft valid and idle? The built-in footer no longer gates
  Save on it; read it when a custom footer wants a disabled Save.
- **`submitError`** — the save error message, if the last submit threw.
- **`markAllTouched()`** — marks every field as touched. Called automatically by
  `submit()`; also useful to surface all errors before a wizard step-change.
- **`submit()`** — marks all fields touched and calls `form.handleSubmit()`. Use this
  to trigger submission from a custom button.
- **`reset()`** — resets the form values and clears touched / submit-error state.

On submit, `useEntityForm` runs `beforeSubmit` (if provided), calls `ctx.set().add()`
in create mode, applies the draft values back onto the entity with `applyValuesToEntity`,
then calls `ctx.saveChangesAsync()`. Save failures are caught and surfaced as
`submitError`; `onSaved` is called on success.

**Validation** runs on every change and on submit via `buildFormErrors` (see
[core forms.md](../../speel-core/docs/forms.md) for the rule pipeline). The result
`{ fields, form }` is passed to TanStack Form as a global validator; TanStack blocks
the submit when anything — a field rule or an entity-level `hasValidation` — fails.
Both halves are rendered: fields show their own error, and the entity-level message
appears as an error bar between the fields and the footer (see Validation surfacing).

**Navigation loading.** On mount, `useEntityForm` lazily loads each navigation whose
value is not already set — self-FK navs resolve their FK IDs against the target set,
inverse-FK collections query the children that point back at the parent. An edit form
on a freshly-fetched entity auto-resolves related objects without a manual `expand`.
A navigation holding bare `{ Id }` stubs (from `deserialize()`) keeps its membership;
each stub is swapped for the tracked row so it displays.

`EntityFormProvider` and `useEntityFormContext` expose the `EntityForm` handle to
descendent components. `EntityFormProvider` is used internally by `EntityFormBody`;
use `useEntityFormContext` in a custom component that needs to read or drive the form.

### `SpeelForm` — all-in-one inline form

`SpeelForm` is the inline CRUD component: it calls `useEntityForm`, renders the field
grid via `EntityFormBody`, and adds a Save / Cancel / Edit footer.

```tsx
import { SpeelForm } from "@speel/react";

<SpeelForm
  entity={project}
  mode="edit" // default 'edit'
  sections={SECTIONS} // or pass fields / exclude
  onSaved={(e) => reload()}
  onCancel={() => setOpen(false)}
/>;
```

Props:

- **`entity`** / **`mode`** — the entity and its form mode.
- **`sections`** — an array of `FormSection` objects (`{ title?, fields }`) that split
  the field set into titled blocks. Mutually exclusive with `fields` / `exclude`.
- **`fields`** — an explicit ordered list of field/nav names (overrides the
  model-derived default set).
- **`exclude`** — names to drop from the default set without listing everything else.
- **`actions`** — replaces the built-in Save/Cancel footer. Either an array of
  `SpeelAction`s — `key`, `text`, an `appearance` (`'primary' | 'secondary' |
'subtle' | 'danger'`; `primary: true` is shorthand), an optional `align: 'start'`
  for a split footer, a `type` (`'button' | 'submit'`), and an `onClick(form)` that
  receives the `EntityForm` handle — or any node, rendered as-is. It is the same
  `actions` shape surfaces and the `MessageBar` take; `actions={[]}` renders no
  footer. (`SpeelFormAction` is the deprecated name of the array element.)
- **`allowEdit`** — `boolean` or `(entity) => boolean`, default `true`. When it is
  false for the entity, view mode is a read-only display form: the footer drops Edit
  and the form has no path into edit mode. Close stays on surfaces.
- **`onSaved`** / **`onCancel`** / **`onError`** — lifecycle callbacks. `onCancel` fires
  from the footer's Cancel, after it has reverted the draft (and, in `'edit'` mode,
  returned to view) — that is where a panel closes itself. Cancel pressed _during_ a
  save aborts instead and fires nothing.
- **`beforeSubmit`** — runs after validation, before persistence; throw to keep the
  form open. **`onSubmit`** — replace the persistence step entirely: it receives the
  validated, draft-applied entity plus `{ mode, signal, addOptions }` and the form
  neither tracks nor saves (call `set(...).add(entity, ctx.addOptions)` yourself if
  you want context tracking).

After a successful save in `'edit'` mode, `SpeelForm` transitions internally to
`'view'` mode and the footer changes to an Edit button (none when `allowEdit` says
no).

### `SpeelDocumentForm` — document libraries

For `SpeelDocument` entities, `SpeelDocumentForm` takes the same props (`actions` and
`allowEdit` included) plus `accept`
and adds the file handling: create mode renders a **required** file input and routes
the save through `add(entity, { file })` with an upload progress bar; edit/view show
the stored file as a read-only link (`FileLeafRef` → `FileRef`). A model that
explicitly surfaces `FileDirRef` gets a create-mode Folder input whose value becomes
the folder placement (see the core modeling docs).

### Saving UX — disabled fields, Cancel aborts

While a save is in flight every input is disabled; the Cancel button stays enabled
and **aborts** the save. The form settles with a neutral "Save canceled." notice
(`ef.submitNotice`), the draft intact, and a clean retry — `onAborted` fires instead
of `onError`. Abort is cooperative: fired requests complete, nothing rolls back.

### Composing fields

When the built-in layout does not fit, compose the form from its fields —
`EntityFields`, `SpeelField`, and the headless `useField` / `useStandaloneField` —
inside an `EntityFormProvider`. The same page covers the people picker and editing a
JSON shape: see [fields.md](fields.md).

### `FormSection` — sectioned layouts

`FormSection` is `{ title?: string; fields: string[] }`. Pass an array as `sections`
to `SpeelForm` or `showForm` to split the field grid into titled blocks with a ruled
divider. Multiline text fields span the full row inside each section; all other fields
flow into the responsive column grid.

### Validation surfacing

Errors are shown per-field: `SpeelField` surfaces the first error from `collectErrors`
when the field is `touched`. Entity-level rules (`b.hasValidation(...)`, which belong to
no single field) get their own error region between the fields and the footer, on the
same visibility rule — silent until the user has touched something. `SpeelForm` /
`EntityFormBody` also renders a `MessageBar` there when `ef.submitError` is set
(save-layer errors, not validation ones).

**Save is not a validity gate.** The footer's Save stays enabled while the draft is
invalid; clicking it marks every field touched, so the click reveals the field errors
and the entity-level message instead of dead-clicking a greyed-out button. Validation
still blocks the save itself — nothing is persisted. Save is disabled only while a save
is in flight. A footer that should refuse the click instead can disable its own button
on `ef.canSubmit`.

`buildFormErrors(et, values, mode)` is exported for consumers that need the full
`{ fields, form }` error map outside of `useEntityForm` (e.g. a custom engine or test).
See [core forms.md](../../speel-core/docs/forms.md) for the rule pipeline.

### Selection fields

Every Choice, lookup and inverse collection renders as one searchable combobox; radio
buttons (`asRadioButtons()`) are the only alternative, and a person column is the
[people picker](fields.md#the-people-picker). Options load on first use, and a field can offer to add what the user typed.
All of it — the three option sources, the Add row, `createsByForm()`, radio "Other" — is on
the [selection fields](selection.md) page.

Lookup fields — person columns included — hold object values (entity instances, or
`Principal` arrays for a multi-value person column) rather than raw IDs, and write the
selected objects back through `field.setValue`. An inverse-FK collection (related items that
point back at the parent) is a multi-select combobox: picking edits the collection's
membership on the entity, and core relationship fixup re-parents the children on save.

> Stability: still settling. Navigation loading uses query-based fetches; the
> `.Entry`-style explicit-load analogue is not yet wired (see the gotcha below).

## Boundaries & gotchas

- **Remount on mode change.** `SpeelForm` remounts on every mode change (`key={mode}`)
  to prevent stale closures. If you control mode outside `SpeelForm`, apply the same
  pattern — key the inner component on `mode`.

- **Validator is silent on a clean field.** `SpeelField` only surfaces errors when
  `touched` is `true`. `ef.submit()` calls `markAllTouched()` first so all errors
  appear before the submit is blocked. If you call `form.handleSubmit()` directly,
  run `ef.markAllTouched()` first.

- **Nothing validation-related shows on an untouched form.** Both the field errors and
  the entity-level region wait for `touched`. A form that opens invalid (a create form
  with required fields) is deliberately quiet until the user edits something or presses
  Save; call `ef.markAllTouched()` to surface everything earlier, e.g. on a wizard step.

- **`useEntityForm` must be inside `SpeelProvider`.** It calls `useSpeelContext()` to
  access the `DbContext`. If rendered outside a provider the hook throws immediately.

- **`.Entry` explicit loading is not yet wired.** The EF Core `Entry().Reference().LoadAsync()`
  analogue is not implemented. Pre-expand navigations before passing the entity to the form.
