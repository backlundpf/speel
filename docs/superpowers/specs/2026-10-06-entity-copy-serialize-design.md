# Entity copy, serialize and value transfer — design

Date: 2026-10-06 · Status: approved in conversation, pending written-spec review

## Goal

Custom edit forms need to work on a copy of an entity that looks exactly like the
original — including the read-only system fields (`Created`, `Modified`, `Author`,
`Editor`, …) shown in view mode — and then either save it as a **new row** (duplicate)
or apply it back to the **existing row**. Drafts and cross-frame hand-offs need a
JSON-safe form of an entity that round-trips into a real one.

Deliverables:

1. `DbSet<T>.clone(entity)` — a complete, untracked copy.
2. `DbSet<T>.serialize(entity, options?)` / `DbSet<T>.deserialize(data)` with a typed
   `SerializedEntity<T, M>`.
3. `EntityEntry<T>.setValues(source)` — copy values onto a tracked entity.
4. `DbSet.update(entity)` fix — a different instance with a tracked `Id` applies its
   values instead of being ignored.
5. `DbSet.add(entity)` accepts read-only values (warns, never writes them) and clears
   them after a successful insert.
6. `@speel/react` `useEntityForm` loads navigations that hold untracked targets.

## Usage

```ts
// Duplicate: a new row that starts out looking like the source.
const copy = ctx.projects.clone(project);
delete copy.Id;
ctx.projects.add(copy); // warns about the read-only values it will not write
await ctx.saveChangesAsync(); // read-only fields cleared on the copy after insert

// Edit a scratch copy, then apply it back.
const draft = ctx.projects.clone(project);
draft.Title = "Renamed";
ctx.projects.update(draft); // == ctx.entry(project).setValues(draft) + Modified
await ctx.saveChangesAsync(); // sends Title only

// Drafts / postMessage.
const data: SerializedEntity<Project> = ctx.projects.serialize(project);
localStorage.setItem("draft", JSON.stringify(data));
const restored = ctx.projects.deserialize(
  JSON.parse(localStorage.getItem("draft")!),
);
```

## Decisions

### `clone(entity): T`

| Topic         | Decision                                                                                                                                                                                                                                                               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coverage      | `new ctor()`, then every model property (key and read-only included) and every navigation. Non-model own fields are not copied.                                                                                                                                        |
| Values        | Deep copy: `Date` → new `Date`, arrays → new arrays, Json shape instances → new instances of the **same class** with the symbol-keyed unknown-key bag carried over. Other objects (object-valued Choice) are deep-copied plain.                                        |
| Navigations   | Shared, not cloned: a reference points at the same target instance; a collection is a new array of the same targets. Cloning targets would create second instances of tracked rows.                                                                                    |
| Tracking      | The clone is never tracked. The source and its entry are untouched.                                                                                                                                                                                                    |
| Shared helper | `Snapshot`'s private `deepClone` flattens shape instances to plain objects (correct for snapshot comparison, wrong for a clone). A prototype- and bag-preserving `cloneValue` is extracted to `src/Entities/` for clone/setValues; `Snapshot` keeps its own behaviour. |

### `setValues(source: Partial<T>): void` on `EntityEntry<T>`

| Topic       | Decision                                                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What copies | Writable model properties and navigations **present on the source** (`in` check), so a partial patch works. Values pass through `cloneValue`; navigation targets are shared as in clone. |
| Skipped     | The key and every read-only property / read-only navigation (and its FK) — silently.                                                                                                     |
| State       | Not changed directly, snapshot untouched. `detectChanges` (run before every save) moves `Unchanged` ↔ `Modified` from the real diff.                                                     |
| Errors      | `Deleted` entry → `InvalidOperationException`. Any other state (incl. `Added`, `Detached`) is allowed.                                                                                   |

### `update(entity)` fix

Today, when a _different_ instance with the same `Id` is tracked, `update()` marks the
tracked entry `Modified` and ignores the passed instance's values — the save diff finds
nothing and the edits are silently lost. New behaviour for that case only:
`trackedEntry.setValues(entity)`, mark `Modified`, return the tracked entry. Only
columns that actually differ are sent (a `Modified` entry with no diff goes back to
`Unchanged` in `detectChanges`). The same-instance and untracked cases are unchanged.

### `add(entity)` and read-only values

| Topic        | Decision                                                                                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accept       | The read-only rejection (`DbSet.ts`, "read-only property … has a value") is replaced by one `console.warn` per `add()` call listing the properties. `PayloadBuilder` already never writes read-only columns.                       |
| `Id`         | Still rejected — duplicating means deleting `Id` from the clone first.                                                                                                                                                             |
| After insert | `SaveExecutor.reconcile` (insert) clears every read-only property and every read-only navigation plus its FK (`Author`/`AuthorId`, …) to `undefined` **before** `refreshSnapshot()`. New rows are not re-queried for these fields. |
| File add     | `reconcileFileAdd` does the same clear first, then applies `fileFactsPatch`, so the server's file facts still land.                                                                                                                |

### `serialize` / `deserialize`

| Topic            | Decision                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Output           | A plain JSON-safe object (not a string) with the entity's keys: model properties and navigations only. Callers `JSON.stringify` it, store it in IndexedDB, or `postMessage` it.                                                                                                                                                                                                 |
| Envelope         | None — no version marker. `deserialize` is lenient: a missing key leaves the property absent, an unknown key is ignored; Json shapes already round-trip unknown keys. A marker can be added if the format itself ever changes.                                                                                                                                                  |
| DateTime         | Through the existing wire codec (`codecFor` → `toWire`/`fromWire`): ISO string; an invalid value raises its `DataException`.                                                                                                                                                                                                                                                    |
| Json shapes      | The shape codec's **object** form (not its string form): declared props serialized recursively plus unknown keys merged back; `deserialize` rebuilds shape instances with the unknown-key bag. The shape codec gains an object-level pair for this.                                                                                                                             |
| Other values     | Pass through. The provider codec (`toProvider`/`fromProvider`) never runs — it is not speel's JSON.                                                                                                                                                                                                                                                                             |
| Navigations      | `options.navigations: "stub"` (default) writes references as `{ Id }`/`null`, collections as `{ Id }[]`. `"full"` writes each **loaded** target as `SerializedEntity<Target, "stub">` — one level only, so cycles are impossible; an unloaded navigation stays a stub. Targets without an `Id` are omitted.                                                                     |
| Deserialize navs | No flag: a value whose only key is `Id` is a stub; anything else is a full target. A target the context already tracks resolves to the **tracked instance** and its serialized values are ignored (deserialize never mutates tracked entities). Otherwise a stub becomes a bare `new TargetCtor()` with `Id` set, and a full target is deserialized into an untracked instance. |
| Result           | Untracked, like `clone`; goes on to `add()` (after deleting `Id`), `update()`, or `entry.setValues()`.                                                                                                                                                                                                                                                                          |
| Errors           | Non-object input → `DataException`. Bad dates / malformed shapes → the existing codec exceptions, naming the property. Wrong-typed scalars pass through (validation is the form's and the save's job).                                                                                                                                                                          |

### Types (exported from `@speel/core`)

```ts
export type NavigationMode = "stub" | "full";

type SerializedValue<V, M extends NavigationMode> = V extends Date
  ? string
  : V extends readonly (infer U)[]
    ? SerializedValue<U, M>[]
    : V extends object
      ? "Id" extends keyof V
        ? M extends "full"
          ? SerializedEntity<V, "stub"> | { Id: number }
          : { Id: number }
        : { -readonly [K in keyof V]: SerializedValue<V[K], "stub"> }
      : V;

export type SerializedEntity<T, M extends NavigationMode = "stub"> = {
  -readonly [
    K in keyof T as T[K] extends Function ? never : K
  ]: SerializedValue<T[K], M>;
};
```

Optional/nullable members stay optional/nullable. A navigation is recognised by its
target carrying an `Id` key; a Json shape that declares its own `Id` property would be
typed as a navigation — documented as a boundary. Non-model fields appear in the type
but not at runtime — also a boundary.

`serialize<M extends NavigationMode = "stub">(entity: T, options?: { navigations?: M }): SerializedEntity<T, M>`;
`deserialize(data: SerializedEntity<T, NavigationMode>): T`.

### `@speel/react` form load-skip

`useEntityForm`'s navigation-load effect currently skips any navigation whose form value
is non-null, so a deserialized stub (bare target, no Title) would display blank. New
rule: load when the value is null **or** is a target the context does not track (for a
collection, any untracked element). Values picked in the form are tracked or come from
the picker and stay skipped. If the entry handle's `loadAsync` short-circuits on an
assigned value, it is told to reload for this case.

## Out of scope

Deeper or per-navigation `"full"` selection (include-style); an async
`deserializeAsync` that fetches untracked targets; cloning navigation targets; a
`duplicate()` helper (clone + delete `Id` covers it); copying file content for
`SpeelDocument` duplicates.

## Testing

Core (vitest, `FakeStorageProvider`):

- **clone** — shape instance keeps its class and unknown-key bag; Dates/arrays are
  independent; navigation targets identical (`toBe`); clone untracked; source entry
  unchanged.
- **serialize/deserialize** — round-trip of Date, Json shape (incl. unknown keys),
  multi-Json, plain values; stub and full modes; full is one level on a cyclic model;
  unloaded nav stays a stub in full mode; stubs resolve to tracked instances and tracked
  wins over serialized values; untracked stub → bare instance with `Id`; non-object
  input and bad date throw. Type tests (`.test-d.ts`) for `SerializedEntity<T, M>`.
- **setValues** — partial patch; key and read-only skipped; values cloned on the way
  in; no-op diff ends `Unchanged`; `Deleted` throws.
- **update(clone)** — payload holds only changed columns; tracked entry returned.
- **add** — read-only values warn once, are never in the payload, and are cleared after
  insert on the item path and the file-upload path (file facts still applied).
  `DbSet.write.test.ts` "add throws when a read-only property…" flips to the warning;
  the comments in `decorators.test.ts` and `readOnlyDeclaration.test-d.ts` are updated.

React: `useEntityForm` loads a reference holding an untracked stub and a collection
holding an untracked element; a tracked value is still skipped.

The SPFx sample must still pass `heft build`.

## Docs & release

Document step (once, at the end of the branch): `speel-core/docs/saving.md`
Capabilities gains the `add`/`update` behaviour and `setValues`, Boundaries gains
"delete `Id` before `add()`"; clone/serialize go in `saving.md` if it stays ≤ 250 lines,
otherwise a new `docs/entities.md` with a README TOC line. `speel-react/docs/forms.md`
notes the load rule if it covers loading. One `minor` changeset for `@speel/core` and
`@speel/react`.
