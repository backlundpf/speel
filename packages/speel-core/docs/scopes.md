# Scopes

## What & when

`saveChangesAsync()` flushes **everything** the context is tracking. When one piece of
code must save one thing without committing unrelated pending changes — a picker creating
a missing lookup target while the surrounding form is half-edited, a background write
beside an open draft — it saves through a **scope**: `db.createScope()` returns a unit of
work over the same model, provider and caches, with its own change tracker. Reach for this
page when a save must stay narrower than the context it runs in. The save pipeline itself
is in [saving.md](saving.md).

## Canonical example

```ts
import {
  DbContext,
  Entity,
  ManyToOne,
  SpeelEntity,
  TextField,
} from "@speel/core";

@Entity({ list: "Programs" })
class Program extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
}

@Entity({ list: "Projects" })
class Project extends SpeelEntity {
  @TextField({ required: true }) public Title: string | null = null;
  @ManyToOne(() => Program) public Program: Program | null = null;
}

class ProjectContext extends DbContext {
  public projects = this.set(Project);
  public programs = this.set(Program);
}

// `db` has pending work the user has not saved yet.
async function addProgramFor(
  db: ProjectContext,
  project: Project,
  title: string,
) {
  const program = Object.assign(new Program(), { Title: title });

  const scope = db.createScope();
  scope.programs.add(program); // add() returns an EntityEntry; keep the entity itself
  await scope.saveChangesAsync(); // writes the one Program, nothing of db's

  // The saved row carries its Id, so it is safe as the parent's navigation value.
  project.Program = program;
}
```

Later, `db.saveChangesAsync()` saves the project with `ProgramId` derived from the new
row's `Id`, and does not insert the program a second time.

## Capabilities

### A scope is used exactly like its parent

A scope is an instance of the parent's own context class. Its `DbSet` properties
(`scope.programs` above) are rebound to the scope, and everything else works as it does on
the parent: `scope.set(X)`, queries, `add` / `update` / `remove`, `entry()` and explicit
loading, the immediate file operations, and `saveChangesAsync()`. Its save flushes only
what was done through the scope; the parent's pending changes stay pending.

### What is shared, what is owned

- **Shared** — the **model** (never rebuilt; `onModelCreating` does not run again), the
  **provider**, and the **cache coordinator**, so a scope's save invalidates the same
  cached lists the parent reads.
- **Owned** — the **change tracker**, the **identity map** and the **save executor**. A
  row loaded through the scope is a different instance from the same row loaded through
  the parent.

### Isolation, like two contexts over one database

The parent learns nothing when a scope saves. There is no merge-back:

- A row the scope created is still tracked by the scope, not the parent. Handing it to the
  parent as a navigation value is safe — the parent's save derives the FK from the row's
  `Id` and never attaches the row itself.
- If the parent had loaded a row the scope then updated, the parent's instance is stale
  until re-read. Its caches are already invalidated, because the coordinator is shared.

### Nesting and disposal

A scope can create its own scope. Disposing the parent does not dispose its scopes, and a
scope's `dispose()` touches only itself — a short-lived scope needs no teardown beyond
letting it go.

### Where speel uses it

The stock lookup creators — `createsByDisplayField()` in core and `createsByForm()` in
`@speel/react` — save the new target row through a fresh scope, which is why adding a value
from a picker never commits the rest of the form ([selection.md](selection.md)). A custom
creator should do the same.

> Stability: still settling. An explicit way to pull a scope's rows into the parent
> (an `adopt`) may be added if a use for it appears; nothing needs one today.

## Boundaries & gotchas

- **The subclass constructor does not run for a scope.** Subclasses may take arguments core
  cannot know, so a scope is built from the base context and given the subclass's
  prototype. Field initialisers do not re-run, and a subclass's private `#fields` are not
  set up on a scope — a method that reads one throws there.
- **Own state that is not a `DbSet` is shared by reference.** Services, helpers and
  constructor arguments stored on the context are the parent's objects on the scope too.
  That includes **arrow-function properties**, which close over the _parent's_ `this`: a
  `saveAll = () => this.saveChangesAsync()` called on a scope saves the parent. It also
  includes instance-level overrides, such as a test spy installed on the parent's
  `saveChangesAsync`, which the scope then carries as its own. Declare such members as
  ordinary methods when they should follow the scope.
- **A set reached through a getter or a helper object is still the parent's.** Only own
  `DbSet` properties are rebound. `scope.set(X)` is always the scope's own set; prefer it
  whenever the context exposes a set any other way.
- **`add()` returns an `EntityEntry`, not the entity.** Keep your own reference to the
  instance you added (or read `entry.entity`) to return or reuse it after the save.
- **A scope does not refresh the parent.** Anything the parent is tracking that a scope
  changed must be re-read before the parent relies on it: the parent's instance and its
  snapshot still hold the values it loaded.
- **No transaction.** A scope narrows _what_ is saved, not _how_: its save is the same
  batched, non-atomic flush described in [saving.md](saving.md).
