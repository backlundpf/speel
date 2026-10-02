# Authoring migrations by hand

## What & when

Generated migrations cover schema changes the diff can detect. Reach for hand-authored steps when
you need data transforms (backfills, rebuilds) or renames — anything the diff doesn't emit. This
page covers `run()` steps, the state bag, the fresh-entities-after-drop gotcha, and the full
builder verb set.

## Canonical example

A list rebuild that saves rows before dropping, recreates the list, and re-inserts under new
fields — with a data transform in between:

```ts
import { defineMigration } from "@speel/migrations";
import { Project } from "../AppContext";

export default defineMigration("20260610T0900_RebuildProjects", {
  up(b) {
    // 1. Save existing rows into the state bag before the list is gone.
    b.run(async ({ context, state }) => {
      state.rows = await context.set(Project).toArrayAsync();
    });

    // 2. Drop and recreate.
    b.dropList("Projects");
    b.createList("Projects", { template: "genericList" });
    b.addField("Projects", "Title", (f) => f.text({ required: true }));
    b.addField("Projects", "StartDate", (f) =>
      f.dateTime({ displayFormat: "DateOnly" }),
    );

    // 3. Re-insert as *fresh* entities — never re-add instances carrying old ids.
    b.run(async ({ context, state }) => {
      const set = context.set(Project);
      for (const r of state.rows as Project[]) {
        const fresh = new Project();
        fresh.Title = r.Title;
        fresh.StartDate = r.StartDate;
        set.add(fresh);
      }
      await context.saveChangesAsync();
    });
  },
  down(b) {
    // down mirrors the rebuild in reverse (or is a no-op when data loss is acceptable)
  },
});
```

## Capabilities

### `run()` steps

Call `b.run(async ({ context, state }) => { … })` anywhere in an `up` or `down` body. Steps
execute in declaration order, interleaved with schema ops. The `context` is your live `DbContext`;
`state` is a plain `Record<string, unknown>` that persists across steps within one migration
execution. Use it to pass data from a pre-drop read to a post-create insert.

Prefer the labelled form, `b.run('backfill task statuses', async ({ context }) => { … })`. A
dry-run preview cannot inspect what a `run` step does, so the label is the only human-readable
description an admin gets before approving it.

### Builder verbs

All verbs are on `MigrationBuilder`. The verified set from `src/operations/MigrationBuilder.ts`:

**List operations**

| Verb                       | What it does                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| `createList(title, opts?)` | Create a new list. `opts`: `template`, `url`, `description`, `onQuickLaunch`. |
| `dropList(title)`          | Recycle the list (moves to site recycle bin, not a hard delete).              |
| `renameList(from, to)`     | Rename a list. The diff never emits this — hand-merge after `add`.            |

**Field operations**

| Verb                            | What it does                                                         |
| ------------------------------- | -------------------------------------------------------------------- |
| `addField(list, name, build)`   | Add a field. Pass a builder callback: `f => f.text(...)`. See Title. |
| `alterField(list, name, build)` | Change an existing field's attributes, or its type.                  |
| `dropField(list, name)`         | Remove a field permanently.                                          |
| `renameField(list, from, to)`   | Rename a field. The diff never emits this.                           |

**Index operations**

| Verb                     | What it does           |
| ------------------------ | ---------------------- |
| `addIndex(list, field)`  | Add a column index.    |
| `dropIndex(list, field)` | Remove a column index. |

**`FieldSpecBuilder` methods** (the `f =>` callback in `addField`/`alterField`):

`f.text()`, `f.note()`, `f.number()`, `f.currency()`, `f.boolean()`, `f.dateTime()`,
`f.choice(choices[])`, `f.multiChoice(choices[])`, `f.lookup({ list, showField?, multi? })`,
`f.user({ showField?, multi? })`.

All accept common options: `displayName`, `description`, `required`, `indexed`, `default`, plus
two that apply at creation only: `hidden` and `addToDefaultView`.

### Default view placement

`addField` puts the new column in the list's default view. Opt a column out with
`addToDefaultView: false` (tracking or system columns); a `hidden: true` column is left out
automatically. Columns added before this behaviour existed are not moved retroactively — put them
in the view from a `run` step:

```ts
import "@pnp/sp/views/index.js";
import { getSPFI } from "@speel/pnpjs";

b.run("show Priority in the default view", async ({ context }) => {
  const view = getSPFI(context).web.lists.getByTitle("Tasks").defaultView;
  await view.fields.add("Priority");
});
```

### Changing a column's type

`alterField` accepts a builder of a different type — `f.note()` over a `Text` column, `f.text()`
over a `Note` — and the generated `down` reverses it. Widening keeps every value. **Narrowing may
lose data**: Note → Text truncates each value to 255 characters, Text → Number or Text → DateTime
drops values that do not convert, MultiChoice → Choice keeps one selection. The step still runs;
`migrations:add`, `plan()`, the apply log and the admin panel all flag it (see runtime.md). Before
a narrowing `down`, back up what matters from a `run` step.

> Stability: still settling. The `FieldSpecBuilder` API reflects
> `src/operations/FieldSpecBuilder.ts`; verify against that file for new field types.

### The built-in `Title` column

SharePoint creates a `Title` column with every list, so no migration ever adds one. Write
`addField(list, 'Title', …)` as you would for any other column — the builder records it as an
`alterField` and the display name, `required`, `description` and length settings you declare are
merged onto the built-in. The plan preview says `Alter field Title` so an admin can see that no
new column appears.

Declare nothing for `Title` and the builder does the reverse: each `createList` picks up a
trailing op clearing `Required` on the built-in, because a mandatory column your model has no
property for makes items unsavable through the application. Nothing else about the column is
touched. To keep `Title` required without mapping it, say so — `addField(list, 'Title', f =>
f.text({ required: true }))` — and the relax step is not emitted.

### Renames

`renameList` and `renameField` exist for cases where you want to preserve data across a rename.
The CLI diff never emits these — it emits a `dropField`/`addField` pair instead. After running
`migrations:add`, open the generated file, replace the pair with the rename verb, and re-test
locally before committing.

## Boundaries & gotchas

- **Fresh entities after drop/recreate.** When you drop a list and reinsert rows, construct `new`
  entity instances. Do not re-`add` objects read before the drop — they carry old `Id` values that
  would conflict or be rejected by SharePoint.
- **`run()` order is declaration order.** A `b.run(…)` before `b.dropList(…)` runs before the
  drop. If you read rows after the drop, you get nothing.
- **`state` is ephemeral.** It lives only for the duration of one `Migrator.migrate()` call. Do
  not use it as a cache across separate `migrate()` calls.
- **Unlabelled `run` steps read as minified source in production.** A preview falls back to
  `fn.toString()`, and an SPFx production bundle is minified and comment-stripped. Label the step
  or an admin sees mangled code.
- **Schema ops inside `run()` are not tracked.** Calling `context.schema.createList(…)` directly
  inside a `run` step bypasses idempotency and history tracking. Use the builder verbs for schema
  work and `run` only for data work.
- **`dropField(list, 'Title')` fails loudly.** It is passed through as a real delete and
  SharePoint rejects it — the built-in cannot be removed. Relax it or rename it instead.
- **The `Title` steps run only when their migration runs.** A migration already recorded in
  history is never re-executed, so a site provisioned before this behaviour existed keeps its
  required `Title` until you author a new migration that alters it.
- **Sites provisioned before this behaviour carry an orphan.** An `addField` on `Title` used to
  collide, leaving SharePoint's suffixed column (`Title0`) alongside the built-in. Internal names
  are immutable, so re-running fixes nothing — drop the orphan.
- **Note → Text is lossy, and so is rolling a widening back.** A migration that widens a column
  has a `down` that narrows it; rolling back truncates whatever was written in between.
- **`renameList`/`renameField` do not update the snapshot.** After hand-merging a rename, run
  `migrations:list` to confirm the snapshot is clean. If it reports drift, re-run `migrations:add`
  to reconcile.
