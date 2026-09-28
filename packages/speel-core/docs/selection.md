# Selection options

## What & when

A Choice column and a lookup navigation are both **selection fields**: the user picks a
value from a set. Both carry one options surface on the model — where the set comes from,
how it is searched, what may be picked, and (for a lookup) how to create a row that is not
there yet. Reach for this page when a Choice list is not a fixed literal, when a lookup's
target is too long to load whole, or when users should be able to add a missing value from
the picker. `@speel/react` renders every selection field from this surface; see its
[selection page](../../speel-react/docs/selection.md) for the control.

## Canonical example

```ts
import {
  ChoiceField,
  DbContext,
  Entity,
  ManyToOne,
  SpeelEntity,
  TextField,
  createsByDisplayField,
  searchesDisplayField,
} from "@speel/core";

@Entity({ list: "Programs" })
class Program extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "JobTitles" })
class JobTitle extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Staff" })
class Staff extends SpeelEntity {
  // A literal list: known at build, provisioned as the column's Choices.
  @ChoiceField({ options: ["Active", "On leave", "Left"], required: true })
  public Status: "Active" | "On leave" | "Left" | null = null;

  // A list read at runtime: a thunk taking `{ db }`, evaluated once per field.
  @ChoiceField({
    options: async ({ db }) =>
      (await db.set(Program).toArrayAsync()).map((p) => p.Title ?? ""),
  })
  public ProgramName: string | null = null;

  // A long target: ask the source per search term instead of loading it whole.
  @ManyToOne(() => Program, { optionsQueryAsync: searchesDisplayField() })
  public Program: Program | null = null;

  // A catalog that grows on demand: a typed title with no match becomes a new row.
  @ManyToOne(() => JobTitle, { optionsCreateAsync: createsByDisplayField() })
  public JobTitle: JobTitle | null = null;
}

class StaffContext extends DbContext {
  public staff = this.set(Staff);
}
```

The fluent route spells the same members as builder methods — `hasOptions`,
`hasOptionsQueryAsync`, `hasOptionsCreateAsync`, and so on — on `isChoice()` and on a
relationship builder, so the whole family autocompletes together.

## Capabilities

### One surface, three states

Where the options come from is one axis with three positions:

- **`options` declared** — that set. A literal array, or a thunk `({ db }) => rows` that
  runs once per field instance (never at model build) and may be async. The field then
  searches it client-side.
- **`optionsQueryAsync` declared** — a server query, run per search term. It replaces
  every other source.
- **Neither** (lookups only) — the target's rows, loaded once, searched client-side. This
  is the default, and it is the same single uncapped read a lookup has always issued.

A thunk receives the context and nothing else, on purpose: it is cached, so a cascade
written against the entity being edited would evaluate once and go stale. Cascades belong
on `optionsQueryAsync`, which gets `{ query, db, source }` — plus `set` and `displayField`
on a lookup, where there is a target to query. A Choice's loader has no `set`; use `db`.

A thunk is also what gives a **decorated** Choice a route to data at all: a decorator has
no `this` to close over, but the thunk is handed the context.

### Search and availability are different questions

Two client-side members sound alike and are not:

- **`optionsFilter`** answers _may this be chosen_. It receives an `OptionContext` (the
  candidate `option` plus a `FieldContext`) and runs whatever was typed. Its `values` is the
  form's draft, so availability can depend on a sibling field and follows it as it changes.
- **`optionsQuery`** answers _does this match what was typed_ — it is the search. The
  default is a case-insensitive substring match on each option's rendered text. Replace it
  to rank, truncate or match on something else. It is skipped when `optionsQueryAsync`
  is declared, because the source already searched.

Availability runs first, so a custom search only ever sees selectable options.

`optionsValue` gives an option its key and `optionsRender` its label; both matter once
options are objects rather than strings.

### `searchesDisplayField()` — the stock search

`searchesDisplayField()` is the ready-made `optionsQueryAsync` for a lookup: a `contains`
on the navigation's display column, capped at `OPTIONS_QUERY_TAKE` (100) rows, with an
unfiltered first page when the picker opens cold. Pass `{ take }` to change the cap. The cap
is the query path's alone — a user can always type further to reach row 101, which is not
true of a list loaded once, so `options` and the default load are never capped. A
hand-written loader replaces it with no cliff between the two, and owns its own limits.

### Open and closed Choice columns

A Choice whose `options` is a **literal array** (and which declares no `optionsQueryAsync`)
is _closed_: its values are known at build, so the model validates membership, provisions
the list as the column's `Choices`, sorts by declared position and filters with a
multi-select. A thunk or a query makes the column **open**: no membership rule, a
`FillInChoice` column with no `Choices`, display-text sorting and a text filter.
`declaredOptions(config)` answers which one a config is — the literal list, or `undefined`.

### Creating a missing value

A lookup opts in to creation by declaring `optionsCreateAsync`; its presence is the gate.
The creator receives `{ text, set, db, source, displayField }` — the trimmed text the user
typed, the target's set, the context, the live draft, and the display column — and resolves
the **saved** row, which must carry its id. Resolving `undefined` means the user declined
(a Cancel); it is not a failure. A rejection is.

- **`createsByDisplayField()`** is the stock creator. It returns an existing row whose
  display field equals the text exactly, and otherwise inserts a new target with only the
  display field set, saved through a fresh `db.createScope()` so the form's own pending
  changes are untouched ([scopes.md](scopes.md)). If the insert fails it looks once more —
  another user may have just added the same value — and rethrows only if nothing is there.
- **`findByDisplayField(set, displayField, text)`** is that exact-match lookup, exported
  so a custom creator can start the same way.
- A custom creator saves in its own scope:

```ts
// A JobTitle with a required Category, seeded from the Staff row being edited.
optionsCreateAsync: async ({ text, db, source }) => {
  const row = Object.assign(new JobTitle(), { Title: text, Category: source.Department });
  const scope = db.createScope();
  scope.set(JobTitle).add(row); // add() returns an EntityEntry; keep the entity yourself
  await scope.saveChangesAsync();
  return row;
},
```

A Choice has no `optionsCreateAsync`: its creation is `fillIn` (`allowFillIn()`), and there
is nothing to persist — the typed text is the value.

### `OptionsCreatorHost` — what a UI adds

Beyond core's own arguments, every creator receives an `OptionsCreatorHost` bag. It is empty
in core; a UI binding fills it by module augmentation, so a creator written against that
binding is fully typed while core knows nothing about UI. `@speel/react` adds `surfaces`,
which is how its `createsByForm()` opens a create form, and how a custom creator can
confirm before inserting.

## Boundaries & gotchas

- **`createsByDisplayField()` sets only the display field.** A target with other required
  columns fails at insert and the user sees the server's message. Client-side validation
  does not run either, so a rule such as a `minLength` on the target's display field is not
  enforced. Use `@speel/react`'s `createsByForm()`, or a custom creator, for such a target.
- **A creator must return a saved row.** An unsaved instance has no id, and the field
  derives its FK from the id.
- **`optionsCreateAsync` belongs on the FK-owning side.** Declaring it on an inverse
  (`withOne` / `@OneToMany`) navigation throws `NavigationConfigurationException` at build.
- **The exact-match check is a race, not a lock.** Two users adding the same value in the
  same second can still create two rows; SharePoint's "Enforce unique values" on the column
  is the real guarantee, and the stock creator's retry then returns the winner.
- **A Choice declaring `optionsQueryAsync` is open even beside a literal list.** The query
  decides what can be picked, so the literal list is not treated as closed.
- **Switching a Choice from a literal list to a thunk or query changes its column.** The
  next migration snapshot provisions it with no `Choices` and `FillInChoice` on.
- **A person column ignores `options`, `optionsQuery`, `optionsFilter` and
  `optionsCreateAsync`.** People are resolved and provisioned by identity; only
  `optionsQueryAsync` shapes what a people picker suggests.
- **A cascade on `optionsQueryAsync` re-runs only when the search text changes.** `source`
  is read when the query runs; a sibling field changing does not re-run it. For a loaded
  list, `optionsFilter` over the draft is the cascade.
- **A loader that ignores `query` reloads the whole target on every term.** If a loader has
  no use for the text, the field wanted `options` or the default load instead.
- **Object-valued Choice options want `optionsValue`.** Without it options are keyed by
  reference, so an equal object that is not the same instance — a value converted back
  from storage, say — matches none of them.
