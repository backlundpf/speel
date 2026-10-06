# Entities: copy, duplicate, serialize

## What & when

A custom edit form often needs to work on a **copy** of an entity that still looks like
the original, including the read-only system fields (`Created`, `Modified`, `Author`, …)
shown in view mode. Saving that copy either creates a **new row** (a duplicate) or
applies its edits **back onto the existing row**. Drafts kept in storage, and entities
handed across a frame with `postMessage`, need a JSON-safe form that turns back into a
real entity.

`DbSet` provides `clone`, `serialize` and `deserialize` for these cases, and
`EntityEntry.setValues` applies a copy back onto a tracked row. All of them work from
the model's metadata, so they treat Dates, Json shapes and navigations correctly. Read
this page when you copy, duplicate or persist entities outside the change tracker. The
save pipeline they feed into is in [saving.md](saving.md).

## Canonical example

```ts
import {
  DbContext,
  Entity,
  ManyToOne,
  SpeelEntity,
  TextField,
  type SerializedEntity,
} from "@speel/core";

@Entity({ list: "Departments" })
class Department extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Projects" })
class Project extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
  @ManyToOne(() => Department) public Department: Department | null = null;
}

class ProjectContext extends DbContext {
  public projects = this.set(Project);
  public departments = this.set(Department);
}

const project = (await db.projects.findAsync(42))!;

// Duplicate: the copy shows the source's Created/Author until it is saved.
const copy = db.projects.clone(project);
delete copy.Id;
copy.Title = `${project.Title} (copy)`;
db.projects.add(copy); // warns: read-only Created, Author, … will not be written
await db.saveChangesAsync(); // copy.Id is the new row; its read-only fields are cleared

// Edit a scratch copy, then apply it back: only the changed columns are sent.
const draft = db.projects.clone(project);
draft.Title = "Renamed";
db.projects.update(draft); // same as db.entry(project).setValues(draft) + Modified
await db.saveChangesAsync();

// Keep a draft across reloads.
const data: SerializedEntity<Project> = db.projects.serialize(draft);
localStorage.setItem("project-draft", JSON.stringify(data));
const restored = db.projects.deserialize(
  JSON.parse(localStorage.getItem("project-draft")!),
);
```

## Capabilities

- **`clone(entity)` makes a complete, untracked copy.** It copies every model property,
  including the key and read-only fields, deep-copying Dates, arrays and Json shapes. A
  shape keeps its class, and it keeps keys that a newer app version wrote but this one
  doesn't declare. Navigations are copied by reference: a reference points at the same
  target, and a collection is a new array of the same targets. Cloning a target would
  create a second instance of a tracked row. The source and its entry are not touched.
- **To duplicate a row, delete `Id` from the clone and `add()` it.** `add()` accepts
  read-only values, logs one warning naming them, and never writes them. After the
  insert they are cleared to `undefined`, and the new row's own values are not re-read.
- **`update(copy)` applies a copy back.** If a different instance with the copy's `Id`
  is tracked, `update()` copies the copy's writable values onto it, and the save sends
  only the columns that actually changed. A tracked row that was marked for deletion is
  restored.
- **`entry.setValues(source)` applies a copy to a tracked entity explicitly.** It copies
  only the keys present on `source`, so a partial patch works. The key and read-only
  members are skipped. Values are cloned as they are copied in. The entry's state is
  worked out from the real differences at the next save.
- **`serialize(entity)` returns plain, JSON-safe data with the entity's keys.**
  DateTimes become ISO strings and Json shapes become plain objects (with their
  undeclared keys kept). This is the same format a Json column stores. Navigations
  become `{ Id }` stubs.
- **`serialize(entity, { navigations: "full" })` includes loaded targets.** It goes one
  level deep: each loaded target is serialized with its own navigations as stubs, so a
  cycle cannot recurse. An unloaded navigation is written as it is (`null`, or left out
  when `undefined`).
- **`deserialize(data)` returns an untracked entity.** A navigation target the context
  already tracks resolves to the tracked instance, and its serialized values are
  ignored. An untracked stub becomes a bare instance that only has `Id`. An untracked
  full target is rebuilt with its data. Missing keys stay absent and unknown keys are
  ignored.
- **`SerializedEntity<T, M>` is the data's type.** Dates become `string`, Json shapes
  are mapped recursively, navigations become `{ Id: number }` (or the target's stub-mode
  form under `"full"`), methods are dropped and `readonly` is removed.
- **Forms display deserialized stubs.** `@speel/react`'s `useEntityForm` replaces a bare
  `{ Id }` navigation stub with the tracked row and keeps the draft's membership.

> Stability: still settling. The serialized format has no version marker yet, and
> `deserialize` is lenient instead.

## Boundaries & gotchas

- **`add()` still refuses a set `Id`.** Duplicating means `delete copy.Id` first. A
  clone keeps the `Id` so it can be applied back with `update()`.
- **Read-only values are cleared after an insert, not refreshed.** Re-query the row
  (`findAsync`) if the form needs the new row's `Created` or `Author` right away.
- **A `null` navigation is not always a clear.** Entities often initialize navigations
  to `null`. A `null` counts as "not loaded", and is skipped by `setValues`/`update(copy)`
  and left out by `serialize`, when the navigation is an inverse collection or this
  side's foreign key still holds a value, unless the navigation was loaded on that
  object. A navigation that was loaded (by `loadAsync`, a form, or carried by
  `clone`/`deserialize`) and then set to `null` is a clear, and the foreign key is
  cleared with it. Use `[]` to empty a collection.
- **Only model members are copied or serialized.** Fields the model doesn't declare are
  left out at runtime, even though `SerializedEntity<T>` still lists them.
- **A Json shape that declares its own `Id` is typed as a navigation.**
  `SerializedEntity` recognises navigation targets by their `Id` member, so a shape with
  an `Id` property is typed as a `{ Id }` stub. Its runtime data is still correct.
- **The provider codec is not applied.** `serialize` stores model values in speel's own
  JSON. A property's `codec.toProvider` belongs to the column and is not run, so a model
  value that JSON cannot represent (a class instance outside a Json shape) comes back as
  a plain object.
- **Bad input throws `DataException`.** This covers data that isn't an object, an
  unparseable date, a malformed Json shape, and a navigation value without an `Id`.
  Scalars of the wrong type are passed through unchanged; form validation and the save
  catch those.
- **Deserialized entities are untracked.** Send them on with `add()` (after deleting
  `Id`), `update()` or `entry.setValues()`. Calling `attach()` on one whose row is
  already tracked throws, as with any second instance of the same row.
