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

### `EntityFields` + `SpeelField` — composition

When the built-in `SpeelForm` footer or layout does not fit, compose the pieces
manually inside an `EntityFormProvider`:

```tsx
import {
  EntityFormProvider,
  EntityFields,
  SpeelField,
  useEntityForm,
} from "@speel/react";

function MyForm({ entity }) {
  const ef = useEntityForm(entity, "edit", { onSaved: () => reload() });
  return (
    <EntityFormProvider value={ef}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ef.submit();
        }}
      >
        {/* auto field set, minus Description */}
        <EntityFields exclude={["Description"]} />
        {/* Description in a custom slot */}
        <SpeelField name="Description" />
        <button type="submit">Save</button>
      </form>
    </EntityFormProvider>
  );
}
```

**`EntityFields`** renders the surrounding form's field set as `SpeelField`s. By
default: all properties (minus the key and any navigation's backing FK column) in
declaration order, then all navigations; in `'create'` mode read-only
(server-managed) fields are also dropped. Pass `fields` to override the set entirely,
or `exclude` to drop specific names.

**`SpeelField`** is the field dispatcher: given a `name` it calls `useField` to get
the reactive `FieldHandle`, then renders the appropriate adapter primitive based on
the field's `FieldConfig.kind`. In view mode (or for `isReadOnly` fields) it renders a
formatted display instead of an input. A render override declared in the model
(`b.property(…).hasRender(…)`) takes priority over both paths.

A `isNote().asRichText()` field dispatches to the skin's rich text editor
(bold / italic / underline / strike, bullet and numbered lists, links, undo/redo)
whose value is the HTML string the SP Note field stores; in view mode — and in table
cells — the stored HTML renders for real, sanitized through DOMPurify.

### `useField` + `useStandaloneField` — headless

**`useField(name)`** (inside an `EntityFormProvider`) returns a `FieldHandle` for a
named field or navigation. The handle exposes `value`, `values` (the whole draft), `setValue`, `errors`, `touched`,
`markTouched`, `isVisible`, `isEnabled`, `isRequired`, `isReadOnly`, `displayName`,
and `config`. A Choice or lookup also carries `options` (where its options come from) and,
when it can take a value not in its list, `create` — see [selection.md](selection.md).

Use `useField` when a specific field needs custom rendering inside an existing form.

**`useStandaloneField(opts)`** produces a `FieldHandle` outside any entity form —
useful for a lone filter input. Supply `config`, `displayName`, `value`, and `onChange`;
validation runs against `required` and `customValidations`. No `DbContext` needed.

A form-bound field learns whether it accepts input from the model; a standalone one has no
model to ask, so `enabled` is the caller's to pass — typically `false` while a save the field
feeds is in flight. It is distinct from `mode: 'view'`, which renders the formatted value
rather than a disabled input.

Pairing it with `SpeelField` is what gets a standalone control the _same_ body an entity form
would render — including the people picker, which is otherwise a lot of adapter wiring to
reproduce by hand. A person column is a lookup whose target is a provider-source entity:

```tsx
import { Principal, SiteUser } from "@speel/identity";

const field = useStandaloneField<Principal[]>({
  config: {
    kind: "Lookup",
    target: db.model.findEntityType(SiteUser)!, // db extends IdentityDbContext
    displayField: "Title",
    multi: true,
  },
  displayName: "Add members",
  value: picked,
  onChange: setPicked,
  enabled: !saving,
});

<SpeelField field={field} />;
```

The `target` decides who is suggested: `SiteUser` offers people only, `Principal` also merges
in the site's groups. The picker itself appears only when `SpeelProvider` has an `identity`
(see the gotcha below); its suggestions come from `peopleSearch`, and a picked person the site
has never seen is provisioned through `identity.users.ensure`.

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
buttons (`asRadioButtons()`) are the only alternative, and a person column is the people
picker above. Options load on first use, and a field can offer to add what the user typed.
All of it — the three option sources, the Add row, `createsByForm()`, radio "Other" — is on
the [selection fields](selection.md) page.

Lookup fields — person columns included — hold object values (entity instances, or
`Principal` arrays for a multi-value person column) rather than raw IDs, and write the
selected objects back through `field.setValue`. An inverse-FK collection (related items that
point back at the parent) is a multi-select combobox: picking edits the collection's
membership on the entity, and core relationship fixup re-parents the children on save.

> Stability: still settling. Navigation loading uses query-based fetches; the
> `.Entry`-style explicit-load analogue is not yet wired (see the gotcha below).

### Editing a shape

A `Json` field (`@JsonField`/`@MultiJsonField` in the model — see
[core modeling.md](../../speel-core/docs/modeling.md)) is an ordinary field in the caller's
code — `<SpeelField name="Tasks" />` inside a form, same as any other — but renders as a
fieldset rather than an input:

- **Single** — a labelled fieldset of the shape's visible properties, each an ordinary
  `SpeelField` bound to a standalone handle (the `useStandaloneField` primitive above).
- **Multi** — the same fieldset once per array element, each row carrying up/down and remove
  `IconButton`s, with an **Add** button beneath that appends a fresh instance of the shape.
- **View mode, or a read-only field** — the same fieldset with every nested field in view
  mode, so a read-only shape reads as fields rather than as a JSON dump.

Nested fields inherit `mode` and `enabled` from the parent, and a nested property declared
`isVisible(false)` — the literal, not a predicate — keeps it out. A predicate
(`isVisible(c => …)`) always renders: the shape editor reads the declared value and never
evaluates the function, because a shape's properties have no `FieldContext` of their own to
evaluate it against. Likewise `isRequired` counts only as a literal `true`. Each
nested field validates and shows its own message on its own row; the parent Json field also
carries a shape-level summary of what needs attention, silent until the field itself is
touched (see the gotcha below) — so the parent form's submit is blocked while any element is
invalid, the same way any other required field blocks it.

> Stability: still settling — the first cycle of this editing surface.

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

- **FK columns are not rendered or validated.** `EntityFields` excludes any property
  that backs a navigation's FK column (e.g. `OwnerId` when an `Owner` nav exists).
  `buildFormErrors` also skips these columns. Always validate and render the nav name
  (`Owner`), not the scalar FK.

- **A person column resolves outside the options loader.** A declared `optionsQueryAsync` shapes
  what the people picker suggests, but a pick is resolved against the site by its own read on
  login or email — so an override used to scope who is pickable still resolves people outside
  that scope. Deliberate: what a picker offers is a different question from whether the site
  knows who was picked, and resolving through a capped page would refuse a real colleague and
  blank the field. A person column ignores `options`, `optionsQuery`, `optionsFilter` and
  `optionsCreateAsync`.

- **The fallback search with no `peopleSearch` wired asks the source itself.** The picker
  asks the target's provider source (`web/siteusers`) for a `contains` on Title — and Email
  where the target has one — rather than scanning rows client-side. Verified against a live
  tenant: `substringof` is accepted there and genuinely narrows (an unfiltered read returned
  14 users, `substringof` on Title 8, and the shipped Title-or-Email form 10). Worth knowing
  because `eq` on that source has precedent in `@speel/identity` and `contains` did not — had
  SharePoint rejected it, this path would have failed where it used to succeed.

- **The people picker works without `identity`; `identity` widens it.** A person column is
  always the picker: `peopleSearch` suggests, or with nothing wired the target's own rows do.
  A pick is set only once it carries a site id (the save derives the FK from it): an identity
  provisions an id-less hit through `users.ensure`; without one it is matched to the site's
  record by login or email, and an unknown person is refused with the reason on the field.
  Group suggestions on a `principals` target need an identity.

- **`useEntityForm` must be inside `SpeelProvider`.** It calls `useSpeelContext()` to
  access the `DbContext`. If rendered outside a provider the hook throws immediately.

- **`.Entry` explicit loading is not yet wired.** The EF Core `Entry().Reference().LoadAsync()`
  analogue is not implemented. Pre-expand navigations before passing the entity to the form.

- **A shape's nested fields are not their own form.** No submit, no dirty tracking, and no
  `beforeSubmit` of their own — the parent form owns all of that; a shape's editor only ever
  produces a new value for the Json field to hold.

- **A shape's error message is coarser than a normal field's, on purpose.** Each nested row is
  a standalone handle whose `markTouched` is a no-op — there is no parent form to notify — so
  the shape-level summary only appears once the form's own `markAllTouched()` runs, on a submit
  attempt. Consistent with every other field's touched-gating, just coarser for a composite one.

- **A large Json value is a large control.** A `multi` field with fifty elements renders fifty
  fieldsets, with no virtualisation.
