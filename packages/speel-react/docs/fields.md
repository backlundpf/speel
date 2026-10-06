# Fields

## What & when

A form is made of fields, and every field renders through one dispatcher, `SpeelField`.
This page covers the field level: composing a form by hand from `EntityFields` and
`SpeelField`, driving one field headlessly with `useField`, rendering a field with no
entity form at all (`useStandaloneField`), the people picker, and editing a JSON shape.
Reach here when [`SpeelForm`](forms.md)'s layout or footer does not fit, or a lone control
should look and behave exactly like its form counterpart.

## Canonical example

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

`useEntityForm` is the same controller `SpeelForm` uses (see [forms.md](forms.md)); only
the layout and the footer are yours.

## Capabilities

### `EntityFields` + `SpeelField` — composition

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

### The people picker

Pairing `useStandaloneField` with `SpeelField` is what gets a standalone control the _same_ body an entity form
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

### Editing a shape

A `Json` field (`@JsonField`/`@MultiJsonField` in the model — see
[core shapes.md](../../speel-core/docs/shapes.md)) is an ordinary field in the caller's
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

- **Fields need a form around them.** `EntityFields`, `useField`, and a `SpeelField` given
  a `name` read the surrounding `EntityFormProvider`; outside one they have no draft to
  bind to. A control with no entity form is `useStandaloneField` + `<SpeelField field={…} />`.

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

- **A shape's nested fields are not their own form.** No submit, no dirty tracking, and no
  `beforeSubmit` of their own — the parent form owns all of that; a shape's editor only ever
  produces a new value for the Json field to hold.

- **A shape's error message is coarser than a normal field's, on purpose.** Each nested row is
  a standalone handle whose `markTouched` is a no-op — there is no parent form to notify — so
  the shape-level summary only appears once the form's own `markAllTouched()` runs, on a submit
  attempt. Consistent with every other field's touched-gating, just coarser for a composite one.

- **A large Json value is a large control.** A `multi` field with fifty elements renders fifty
  fieldsets, with no virtualisation.
