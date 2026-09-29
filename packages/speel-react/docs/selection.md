# Selection fields

## What & when

Every field where the user picks a value from a set — a Choice, a lookup, a multi-value
lookup, an inverse collection, and the table filter bar's select — renders as **one
control**: a combobox the user can type into, fed by the model's options surface. Radio
buttons are the only alternative, and a person column stays a people picker. Reach for this
page when a picker offers the wrong rows, loads too much, should let users add a value that
is not in the list, or needs custom rendering through `useField`. The model side —
`options`, `optionsQueryAsync`, `optionsCreateAsync` — is in core's
[selection page](../../speel-core/docs/selection.md).

## Canonical example

```tsx
import {
  ChoiceField,
  Entity,
  ManyToMany,
  ManyToOne,
  SpeelEntity,
  TextField,
  createsByDisplayField,
  searchesDisplayField,
} from "@speel/core";
import { SpeelForm, createsByForm } from "@speel/react";

@Entity({ list: "Programs" })
class Program extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
  @ChoiceField({ options: ["Internal", "Client"], required: true })
  public Category: "Internal" | "Client" | null = null;
}

@Entity({ list: "Tags" })
class Tag extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Projects" })
class Project extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;

  // A combobox over four options, searched as the user types.
  @ChoiceField({
    options: ["Planning", "Active", "Blocked", "Done"],
    required: true,
  })
  public Status: "Planning" | "Active" | "Blocked" | "Done" | null = null;

  // Radios, plus an "Other" radio with a text box for a value not listed.
  @ChoiceField({ options: ["Web", "Mobile"], radioButtons: true, fillIn: true })
  public Platform: string | null = null;

  // A long target: search at the source; a missing program opens a create form.
  @ManyToOne(() => Program, {
    optionsQueryAsync: searchesDisplayField(),
    optionsCreateAsync: createsByForm({ fields: ["Title", "Category"] }),
  })
  public Program: Program | null = null;

  // A short catalog, loaded once; a typed tag with no match is inserted on the spot.
  @ManyToMany(() => Tag, { optionsCreateAsync: createsByDisplayField() })
  public Tags: Tag[] | null = null;
}

export function EditProject({ project }: { project: Project }) {
  return <SpeelForm entity={project} mode="edit" />;
}
```

Nothing in the form names a control. `SpeelField` reads each field's config and renders the
combobox, the radio group, or the people picker.

## Capabilities

### One control

The combobox is the same for every selection field: the list opens on focus or click, typing
narrows it, and a pick sets the value (a multi-value field keeps the list open for more). A
single-value field holds zero or one item; a multi-value lookup and an inverse collection hold
many. `asRadioButtons()` (`radioButtons: true`) on a Choice is the only other rendering —
every option on screen, nothing to search. The table filter bar's select is the same
combobox; its boolean and date-preset filters, and the table's pager, stay plain dropdowns.

### Where the options come from

The model's source decides how the control behaves:

- **A list** — a declared `options` array or thunk, or a lookup that declares neither (its
  target's rows). It loads once per field and is searched in memory, so a keystroke is
  answered at once with no debounce.
- **A query** — a declared `optionsQueryAsync`. Each term is a read at the source, debounced
  as the user types. `searchesDisplayField()` is the stock one (`contains` on the display
  column, capped at 100 rows); the cap belongs to the query path only.

Either way, the list offers what passes **availability** (`optionsFilter`), then **search**
(`optionsQuery`, by default a case-insensitive substring of each option's text — skipped for a
query, which searched at the source). Availability sees the whole draft, so it can depend on
a sibling field, and a change to that field re-sieves the list. The held value is kept visible: on the opening list a
saved value is offered even if availability would now reject it, so opening an old record
never blanks the field. A failed read says so in the list rather than looking like "No
matches".

### Loading on first use

A combobox reads nothing when the form mounts. Its options load on the first focus, click or
keystroke, so a form of ten lookups opens without ten reads. The held value renders from the
field itself until then. Radio buttons put every option on screen, so they load on mount.

### Adding what the user typed

When a field can create, the list gains an **Add row**. It appears when the trimmed text is
non-empty and no offered option's text equals it, ignoring case, and sits below any partial
matches (alone, in place of "No matches", when there are none). It reads `Add "<text>"`;
while the creator runs it reads `Adding "<text>"…` and ignores further picks; if the creator
fails it reads `Could not add "<text>"` with an error icon whose callout holds the message,
and picking it again retries. Failures stay in the list and never reach the field's
validation chrome.

- **A lookup declaring `optionsCreateAsync`** runs its creator. On success the new row becomes
  the value (appended for a multi-value lookup) and joins the loaded list, so it is offered on
  the next open. If the creator resolves `undefined` — the user declined — nothing changes.
- **A fill-in Choice** (`allowFillIn()` / `fillIn: true`) needs no creator: the typed text is
  the value. It never shows the adding or failed states.

Two stock creators cover the common cases. `createsByDisplayField()` (core) inserts a row with
only the display field. **`createsByForm()`** (this package) opens a pre-filled create form
for the target instead — for a target with more required columns than its display field. It
returns an existing exact match without opening anything; otherwise it seeds the new row
with `initial?.({ text, source })`, sets the display field to the typed text (the text wins),
and opens the form in a modal by default, titled `New <Target>`. Submit saves through a
`db.createScope()`, so the originating form's own pending changes are untouched, and selects
the saved row; Cancel resolves `undefined`. Save errors stay in the create form.

Every creator also receives `surfaces` — this package's `SurfaceApi`, added to core's
`OptionsCreatorHost` bag — so a custom creator can confirm, or open its own form, before it
inserts.

### Radio "Other"

A single-select Choice declared with both `radioButtons` and `fillIn` renders a final
**Other** radio with a text box. Typing selects Other and sets the value to the trimmed text;
picking a listed radio sets that value, and the typed text is kept for if Other is picked
again. A saved value that matches no listed option opens with Other selected and the value
in its box. An empty box with Other selected is an empty value, so `required` applies. A
multi-select fill-in Choice should stay a combobox, where the Add row covers write-ins.

### Headless: `FieldHandle.options` and `create`

`useField(name)` (and `useStandaloneField`) give a selection field two members for a custom
control. **`options`** is an `OptionsSource`: its `mode` is `"list"` or `"query"`, and
`load(query?)` returns the raw options — once for a list, per term for a query. **`create`**
is present only when the field can create; `create(text)` resolves the created value (a saved
row, or the text itself for a fill-in Choice) or `undefined` when declined. The handle builds
the creator's arguments, so a custom control never assembles them itself.

Skin authors implement the other end: `ComboboxProps.create` and `RadioGroupProps.other`, in
the [skins](skins.md) page.

## Boundaries & gotchas

- **`createsByDisplayField()` fails on a target with other required columns.** It inserts only
  the display field, without client-side validation — a `minLength` rule on the target is not
  enforced either. Use `createsByForm()` or a custom creator there.
- **A creator must resolve a saved row, with its id.** The field derives the FK from it.
- **A person column is a people picker.** It ignores `options`, `optionsQuery`,
  `optionsFilter` and `optionsCreateAsync`; only `optionsQueryAsync` shapes its suggestions.
  People are resolved and provisioned by identity — see [forms.md](forms.md).
- **Explicit `expand` fields must include the target's key.** The default lookup expand
  carries the key and the display field. A held value expanded without its id cannot be
  matched to the picker's rows, so the picker lists it twice.
- **A JSX `optionsRender` needs a custom `optionsQuery`.** The default search matches on the
  rendered text, and an element has none.
- **Object-valued Choice options want `optionsValue`.** Without it options are matched by
  reference.
- **A thunk or query source outside a `SpeelProvider` throws.** Only a literal list works
  without a `DbContext`. Inside a provider, a standalone lookup resolves its target's set
  and loads, queries and creates like a form-bound one. Outside a provider it offers only
  a declared `options` list and cannot create; a standalone fill-in Choice can.
- **A cascade on `optionsQueryAsync` does not follow sibling fields.** The query reads
  `source` when it runs, and it re-runs only when the search text changes — never when
  another field's value does. For a loaded list, `optionsFilter` is the cascade: it reads
  the draft and follows the sibling.
- **A query loader that ignores `query` reloads the whole target per keystroke.** A loader
  with no use for the text wanted `options`, or the default load.
- **An `optionsQueryAsync` is opaque.** The framework can neither cap a loader that forgot to
  nor check that a held value is one the loader would have offered.
- **The Add row's text is not localised yet**, in line with the rest of the skins.
