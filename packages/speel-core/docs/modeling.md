# Modeling

## What & when

Modeling is where you declare what data your app works with: which SharePoint lists,
what columns they contain, how those columns behave in forms, and how entities relate
to each other. Two authoring paths produce the same model: **decorators on the entity
class** — `@Entity` plus one field decorator per property — colocate the configuration
with the data and are the concise default; **`onModelCreating`** — the fluent
`ModelBuilder` — covers programmatic or advanced cases (entity-level validations,
conditional registration). The two interoperate. Reach for this page whenever you are
adding an entity class, mapping a column, adding validations, or refining how a field
presents in a form.

## Canonical example

```ts
import {
  DbContext,
  SpeelEntity,
  Entity,
  TextField,
  NoteField,
  ChoiceField,
  NumberField,
  DateTimeField,
} from "@speel/core";
import type { FieldContext } from "@speel/core";

// Entity class — decorators colocate the model with the data. Opts are nouns
// (`required`, `maxLength`) that mirror the fluent builder's verb methods.
@Entity({ list: "Tasks" })
class Task extends SpeelEntity {
  @TextField({ required: true, maxLength: 120, displayName: "Task Title" })
  public Title: string | null = null;

  @ChoiceField({
    options: ["Open", "In Progress", "Done"],
    required: true,
    displayName: "Status",
  })
  public Status: "Open" | "In Progress" | "Done" | null = null;

  // Conditionally required: only when the task is In Progress or Done.
  @DateTimeField({
    displayFormat: "DateOnly",
    displayName: "Due Date",
    required: (c: FieldContext<Task>) =>
      c.values.Status === "In Progress" || c.values.Status === "Done",
  })
  public DueDate: Date | null = null;

  @NoteField({ displayName: "Notes" })
  public Notes: string | null = null;

  @NumberField({ min: 0, max: 100, displayName: "Effort (%)" })
  public Effort: number | null = null;
}

// Context — declare the set; the @Entity registration supplies the model. No
// `onModelCreating` is needed unless you want the fluent builder (see below).
class TaskContext extends DbContext {
  public tasks = this.set(Task);
}
```

## Capabilities

### Decorator authoring

Decorators are a thin, deferred replay of the fluent builder, so both paths share one
mental model: **builder methods are verbs** (`isRequired()`, `hasMaxLength()`),
**decorator opts are nouns** (`required`, `maxLength`). Decorate the class with
`@Entity({ list })` (add `cache` to opt into query caching — see [caching.md](caching.md),
or any provisioning hint from below), mark a non-`Id` key property with `@Key` (a
`SpeelEntity` subclass inherits `Id` as its key — redeclaring it fails under
`noImplicitOverride`), and give each data property one field decorator:

| Field type       | Decorator           | Fluent equivalent |
| ---------------- | ------------------- | ----------------- |
| Single-line text | `@TextField`        | `isText()`        |
| Multi-line text  | `@NoteField`        | `isNote()`        |
| Number           | `@NumberField`      | `isNumber()`      |
| Currency         | `@CurrencyField`    | `isCurrency()`    |
| Yes/No           | `@BooleanField`     | `isBoolean()`     |
| Date/time        | `@DateTimeField`    | `isDateTime()`    |
| Single choice    | `@ChoiceField`      | `isChoice()`      |
| Multi choice     | `@MultiChoiceField` | `isMultiChoice()` |

Each decorator accepts the shared refinement opts (below) plus its type-specific keys —
`@ChoiceField({ options })`, `@TextField({ maxLength })`, `@DateTimeField({ displayFormat: 'DateOnly' })`.
The relationship decorators (`@ManyToOne`, …) live in [relationships.md](relationships.md).

The fluent form registers in `onModelCreating` (`builder.entity(Task, b => { b.toList('Tasks'); … })`),
for entity-level validations or configuration computed at construction time; the two coexist,
and a fluent `entity(Sub, …)` on a decorated base class inherits the base's decorators.

> Decorators need a Stage-3-capable transform wherever entity code is loaded: Heft has one;
> vitest and the migrations CLI need SWC configured.

### Mapping an entity to its source

Call `b.toList('ListName')` to bind the entity to a SharePoint list by its display title. The
second argument takes provisioning hints `@speel/migrations` uses when creating the list:
`template`, `url`, `description`, `onQuickLaunch`, and `readSecurity`/`writeSecurity`. The same
keys sit alongside `list` on the decorator — `@Entity({ list: 'Contracts', template:
'documentLibrary' })`. Provisioning metadata has no effect at runtime.

A list is one kind of source. `b.toProviderSource(source)` is the general form (`toList` is
shorthand for `toProviderSource({ kind: 'list', list, provisioning })`); the other kind,
`{ kind: 'provider', key }`, binds the entity to something the provider serves that is not a
list — SharePoint's principal endpoints, which core's canonical `Principal`/`SiteUser`/`SiteGroup`
are declared against (`@Entity({ source: { kind: 'provider', key: 'principals' } })`). Such an
entity is read-only through the entity API, never provisioned, and not cacheable; subclass one
to add columns the endpoint carries ([permissions.md](permissions.md): `Employee extends SiteUser`).

**`readSecurity` / `writeSecurity`** take `'own'` to restrict a user to the items they
created. SharePoint enforces it, so no query has to remember an author filter — which is
what lets `@speel/identity`'s `UserSetting` be a per-user store
([settings](../../speel-identity/docs/settings.md)). Both apply at list **creation** only,
and neither expresses "only _these people_ may write" — that is list permissions, which
no migration operation sets ([table views](../../speel-react/docs/table-views.md) depend on it).

**An entity extending `SpeelDocument` is provisioned as a document library** — `template` is
inferred; pass it explicitly to override.

The key is `Id` by convention; `b.hasKey(e => e.CustomKey)` names another. `b.useCaching(...)`
opts the entity into query caching ([caching.md](caching.md)).

### Typed field builders

Call `b.property(e => e.FieldName)`, then chain one `Is*` method to declare the field type;
each returns a type-specific builder with that field's refinements:

- **`isText()`** — single-line text; `hasMinLength`/`hasMaxLength` (capped at 255).
- **`isNote()`** — multi-line text; `asRichText()`, `asAppendOnly()`, `hasLines`.
- **`isNumber()`** — numeric; `hasMin`/`hasMax`, `hasDecimalPlaces`, `showAsPercentage()`.
- **`isCurrency()`** — like number, plus a currency code (`hasCurrencyCode`).
- **`isBoolean()`** — yes/no checkbox; no further refinements.
- **`isDateTime()`** — date/time; `asDateOnly()` drops the time; `hasMin`/`hasMax` bound it.
- **`isChoice()`** — single-select; declare where its options come from immediately after —
  `.hasOptions([...])`, a `.hasOptions(({ db }) => …)` thunk, or `.hasOptionsQueryAsync(…)` —
  or the model throws at construction. Object-valued choices add `hasOptionsValue` (picker
  key), `hasOptionsRender` (label) and `hasCodec`. `asRadioButtons()` swaps the combobox for
  radios; `allowFillIn()` (`fillIn: true`) accepts write-ins.
- **`isMultiChoice()`** — multi-select; same options contract as `isChoice()`.

A thunk reads a Choice list at runtime — the one route a decorated Choice has to data — and
the column is provisioned open, with no fixed `Choices` ([selection.md](selection.md)):

```ts
@ChoiceField({ options: async ({ db }) => (await db.set(Program).toArrayAsync()).map((p) => p.Title ?? "") })
public ProgramName: string | null = null;
```

### Field refinements

Every field builder inherits a shared set of column-level and field-state refinements.
These can be chained in any order after the `Is*` call, and each has a noun-keyed
decorator opt (`isReadOnly()` ↔ `readOnly: true`, `hasColumnName('X')` ↔ `columnName: 'X'`,
`isRequired(fn)` ↔ `required: fn`):

**Column/schema refinements** — `hasColumnName` (if the SP internal name differs from
the property name), `hasDescription`, `hasDefaultValue`, `isIndexed`, `isReadOnly`, and
`hasCodec({ toProvider, fromProvider })` — a model type mapped to and from the field's
_typed_ value (a `Date`, a choice's `string`, a lookup's `number`; per element for arrays); the
decorator's `codec` opt takes the same bag. Its `toWire`/`fromWire` slots are speel's own — how
a value looks inside a `Json` column ([shapes.md](shapes.md)). A `fromProvider` answering
`undefined` leaves the property unset.

**Display** — `hasDisplayName` sets the label used by `@speel/react` forms and tables.

**Field-state predicates** — `isRequired`, `isVisible`, and `isEnabled` each accept
either a plain boolean or a predicate `(c: FieldContext) => boolean`. The predicate
receives a `FieldContext` whose `values` is a plain snapshot of the entity, so any
field can gate on any other:

```ts
b.property((e) => e.ApprovedBy)
  .isText()
  .isEnabled((c: FieldContext<MyEntity>) => c.values.Status === "Approved");
```

**Validations** — `hasValidation(predicate, message)` attaches a custom rule to a
single property; cross-field rules attach to the entity with `b.hasValidation(...)`. Both
feed the pipeline `@speel/react` forms consume ([forms.md](forms.md)). The same refinement
surface is available on relationship builders, so navs carry display names and predicates too.

### `SpeelEntity` and `SpeelDocument`: the canonical shapes

Extending `SpeelEntity` is optional but convenient: it declares the server-managed members
every row carries — `Created`/`Modified`, the `Author`/`Editor` navigations (typed `SiteUser`,
core's canonical site-user entity, with `AuthorId`/`EditorId`) and SharePoint's file-system
plumbing, `FSObjType` (0 item, 1 folder), `FileDirRef` (parent folder URL), `FileLeafRef`
(leaf name) and `FileRef` (the row's URL) — with the same decorators any entity uses
(`@DateTimeField({ systemGenerated: true })`, `@ManyToOne(() => SiteUser, { systemGenerated: true })`,
…); all are system-generated and read-only. Decorator metadata is read up the constructor chain
on every registration path, so fluent and decorated subclasses both inherit every level, and
`SiteUser` joins the model by reference — a core-only context gets `Author`/`Editor` with
nothing to register. A plain class skips them all.

`SpeelDocument extends SpeelEntity` is the document-library shape — `FileSize`, `CheckedOutBy`,
and a writable `FileLeafRef`: see [files and folders](files.md#the-speeldocument-shape).

**Refining or overriding an inherited member.** Members merge by name. A fluent same-type
re-declaration of a _property_ layers on the inherited one — `b.property(d => d.FileLeafRef).isText().isVisible(true)`
refines it and keeps its position; a decorated re-declaration in a subclass replaces it and
moves it to the subclass's level. _Navigations_ differ: any re-declaration by name — subclass
decorator or fluent `hasOne` — replaces the inherited navigation outright and takes the
re-declaring level's position, so restate `systemGenerated` and `foreignKey` when re-pointing `Author`
([relationships.md](relationships.md)). Members emit in inheritance-depth order — own before
inherited — so `@speel/react`'s default columns and fields lead with the entity's own columns.

**`readOnly` and `systemGenerated` answer different questions.** `readOnly` means "never
sent": a save skips the column silently. `systemGenerated` means "the provider owns this
column": `@speel/migrations` never creates it. `systemGenerated` implies `readOnly` unless
`readOnly: false` is given explicitly (as `SpeelDocument.FileLeafRef` does). So a SharePoint
built-in you surface (`File_x0020_Type`) is `systemGenerated: true`, and a model-owned column
that a workflow or formula fills is `readOnly: true` alone: provisioned, never written. Fluent:
`.isSystemGenerated()` / `.isReadOnly()`. **A read-only property should initialize to
`undefined`**, not the `| null` form writable fields use, because `DbSet.add()` warns about
(and never writes) a read-only property holding any other value:

```ts
@NumberField({ columnName: 'ReviewScore', readOnly: true })
public ReviewScore?: number = undefined;     // NOT `: number | null = null`
```

### `@JsonShape` — a type that lives inside a column

`@JsonShape()` declares a class with no rows of its own, stored as JSON inside one Note column
through `@JsonField` (one instance) or `@MultiJsonField` (an array). See [JSON shapes](shapes.md).

## Boundaries & gotchas

- **A Choice with no options source throws at model construction.** Chain `hasOptions` or
  `hasOptionsQueryAsync` after `isChoice()` / `isMultiChoice()`.
- **Model definition is static.** Decorators and `onModelCreating` resolve once, at construction.
- **Entity-level validations use `onModelCreating`.** There is no class-level validation
  decorator; attach cross-field rules with `b.hasValidation(predicate, message)` — a
  decorated entity can still add an `onModelCreating` block for them.
- **No `Id` convention on missing property.** No `Id` and no `hasKey` throws at model
  construction with a clear message. Add `Id?: number` or call `b.hasKey(e => e.MyKey)`.
- **A fluent re-declaration cannot change an inherited member's type.** `.isText()` on an
  inherited text member layers; a different field kind (`isNumber()` on a text member) throws.
  To change the shape of a system member, re-declare it with a decorator in your own subclass.
- **`readOnly` no longer keeps a column out of migrations.** Through 0.1.0-beta.2, declaring a
  SharePoint built-in `readOnly` was how a model read it without provisioning it. Now a
  `readOnly` column that is not `systemGenerated` is provisioned like any model column; mark
  such built-ins `systemGenerated: true` (which also keeps them read-only).
