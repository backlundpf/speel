# Table views

## What & when

`useTableViews` gives a table named, per-user views — saved arrangements a user switches
between — and decides where every piece of table state lives. Reach for it when people work
with the same table repeatedly and want their arrangement back, or when a link to a table
should reproduce what the sender was looking at.

State is split across three layers, applied most decisive first:

| Layer       | Holds                                              | Lives in                   | Persists                   |
| ----------- | -------------------------------------------------- | -------------------------- | -------------------------- |
| URL         | which view, filters, search, sort, page            | two query params per table | across refresh and sharing |
| Application | `scope` — the page's opening position              | a prop the app computes    | never                      |
| View        | columns, order, page size, and the view's question | the view store, per user   | until changed              |

The split is not arbitrary. Filters, search, and sort are _the question you are asking_, so
they belong in the URL where a link can carry them. Columns are _how you like to read the
answer_, so they belong to your view and never travel with a link.

## Canonical example

```tsx
import { useTableViews, SpeelEntityTable } from "@speel/react";
import { AuditResponse } from "../entities/AuditResponse";

// The app's own views. The first is this table's default; add more and the picker lists
// them all, in this order, above the user's own.
const defaultViews = [{ name: "All responses", descriptor: { columns: [] } }];

function ResponsesView({ requestId }: { requestId: number | null }) {
  // No viewStore: views follow the user when identity is wired, and fall back to this
  // browser when it is not. Pass `viewStore` to override.
  const views = useTableViews({ tableId: "ao-responses", defaultViews });

  if (views.loading) return null; // the store decides the layout; do not flash the default

  return (
    <SpeelEntityTable
      of={AuditResponse}
      {...views.table}
      toolbar={views.picker}
      columnChooser
      scope={
        requestId === null
          ? undefined
          : {
              filters: { RequestId: { kind: "select", selected: [requestId] } },
            }
      }
    />
  );
}
```

`views.table` spreads the state, its change handler, and where each layer's filters came from —
which is how the table knows whether a dead filter key is your typo or a user's stale view.
`views.picker` is a ready-made control for the table's `toolbar` slot.

## Capabilities

### The app's own views

`defaultViews` is a list, and the app authors as many as it has answers worth naming — the
dashboard "quick links" pattern, as views rather than as buttons that stuff filters into the
URL:

```tsx
const defaultViews = [
  { name: "Open", descriptor: { columns: [], filters: open } },
  { name: "Submitted", descriptor: { columns: [], filters: submitted } },
  { name: "Returned to GFS", descriptor: { columns: [], filters: returned } },
];
```

**The first entry is the default**: what a user who has never touched the picker lands on, and
what a bare URL means. All of them are read-only, present for every user, and owned by nobody.
Names must be unique within the list, and an empty list is a mistake — both throw at init,
because the list is source code rather than anything a user typed.

### `<prefix>.v` — a link that names its view

Selecting a view writes its **name** to `<prefix>.v`, and a link carrying that name opens on
that view:

```
https://contoso.sharepoint.com/sites/projects/SitePages/Dashboard.aspx?tab=tasks&tasks.v=Submitted
```

Which beats spelling the same filters out: the link says what it means, and keeps meaning it when
the view behind it is improved. Selecting the **default** clears the key, so a bare URL goes on
meaning the default. A name resolves against the app's own views first, then personal, then
shared — first match wins. `.v` is an address rather than a question, so naming a view never
raises Save or Discard changes.

### `<prefix>` — one param carries the question

The other param a table owns is the bare prefix, holding the whole question — filters,
search, sort, page, dismissed scopes — as one short-keyed JSON object (URL-encoded in practice):

```
?tasks.v=Submitted&tasks={"f":{"Status":"s:Closed"},"s":"Title:desc"}
```

`f` maps a column to the same criteria string a saved view stores, `q` is the search text, `s`
is `key:direction`, `pg` the page, `cs` the scope chips dismissed; each is omitted when it has
nothing to say.

**Presence is the contract.** Present, it answers for the question **wholesale** and the view's
own filters and sort are ignored — which is what lets `{"f":{}}` mean "the user cleared every
filter" rather than "nothing to say". Absent, the view speaks. Composed with `.v` as above, it
is exactly a hand-tweaked filter in session: Submitted's rows, this Status, dirty and offering
Save. A question that cannot be read is user-carried state, so it warns once and the view stands:
`[speel] table 'ao-responses': the url question could not be read — using the view instead.`

It is written **only on a change** — loading a view writes nothing, so its presence _is_ the
dirty flag — and every write carries the full effective question, the active view's own filters
and sort included. Change something back to match the view and the param clears again.

### The store seam

`TableViewStore` is `list` / `save` / `remove` and nothing else. **Per-user scoping is the
store's business** — a SharePoint list filtered to the current author, a personal-site list, or
`createLocalViewStore()` for the one-line case. `@speel/react` never learns where views live.

**`viewStore` is optional**, and the default is usually the one you want: with identity wired,
views are kept in the user's settings, so an arrangement follows the person to another machine;
without it they fall back to `createLocalViewStore()` and stay in this browser. Pass a store
explicitly to override either.

The cost of that fallback is worth knowing: the two are different stores and **nothing migrates
between them**, so views saved before an app wires identity appear to vanish once it does.
Re-saving is the fix. See [user settings](user-settings.md).

### Shared views

Pass a second store — `sharedViewStore`, a `TableViewStore` plus `canPublish()` — and the picker
grows a **Shared views** section beside **My views**. `createEntitySharedViewStore(db, opts)`
backs it with the `SharedTableView` list; `opts.canPublish` answers whether this user may
publish, defaulting to **no**, since hiding the action beats offering one that fails.

**Publish moves a view rather than copying it.** The personal record is deleted and a shared one
created, so one name never appears twice under two headings, drifting apart with nothing in the
menu to tell them apart. Unpublish is the same move backwards.

A shared view you cannot edit behaves **exactly like the app-authored default**: read-only, with
"Save as new view" as the way to make it yours, and column tweaks held for the session. One you
can edit shows **Save for everyone** rather than Save — the same operation with a different
blast radius.

The **starting view** — which view you land on — is a per-user setting rather than a flag on the
record, so choosing the shared "Overdue" as your default changes nothing for anyone else. It
needs a settings store; without one the choice lasts the session.

`StoredView` is `{ id, tableId, name, isStartingView?, descriptor }`. The descriptor holds
columns, sort, filters, and page size — not the page number, and not dismissed scopes, which
belong to the current visit rather than to a saved arrangement.

### The lifecycle

Switch, **Save** (folds the URL's question into the active view, then clears the param), **Save
as new view**, Rename, Delete, **Discard changes** (drops the question _and_ any presentation
still held in session, back to the view as saved), and **Start on this view** — the per-user
designated default. Deleting the last named view falls back to the app-authored default, so a
table is never viewless.

The picker collapses all of that to one trigger showing the active view's name, marked with a
dot when there is unsaved work. Save and Discard changes surface beside it only when there is
something to act on; everything else — switching, saving as new, renaming, deleting, publishing,
the column undos — lives in its menu, grouped so each heading supplies the scope its verbs would
otherwise spell out. Creating a view asks for no dialog: it takes the name "My view", switches
to it, and offers the name for inline editing. Switching clears that table's question first,
since the URL outranks the view and would otherwise override the pick.

### Columns auto-save; filters and sort do not

Column arrangement writes through to the active view on a debounce, with **Undo** and **Undo
all** for the session. Layout fiddling is casual and constant, and being asked to confirm a
drag would be tiresome. Filters, search, and sort are the opposite — the thing worth naming
and sharing — so they stay dirty until Save or Discard changes.

**Column widths sit below even that.** A header-drag resize applies for the session only: it
never writes through, never marks a view dirty, and does not survive a refresh — on any view,
default or named. A width authored into a view's descriptor still applies as the baseline.

### `scope`

`scope` is what the page says the table is about: a drill-down, a URL-derived selection, a
dashboard context. It applies wherever the user's own state is silent, and its chips are marked
in the filter bar so an unexpectedly narrow table explains itself.

Those chips are **removable and overridable**, like any other. Removal is recorded so it can be
told apart from "scope still applies", and **Discard changes brings scope back**.

## Boundaries & gotchas

- **`scope` is intent, not access control.** It is the order in which a view is _applied_, and
  a hand-edited query string outranks it by design. Anything security-bearing belongs in the
  `query` — server-side, where it cannot be reasoned around — and real authorisation is speel's
  permissions framework. Client-side filtering never was a boundary: a user who can read an
  item can read it in SharePoint's own list view.

- **The app's views are pristine.** Every entry in `defaultViews` is supplied in code, owned by
  nobody, and never written to. Column changes made while one is active apply immediately but
  live in session state, and the picker's menu offers "Save as new view" instead of a modal
  interrupting a drag. **This is the one place a refresh does not restore your column arrangement** — the
  question survives in the URL, the column fiddling does not. That is the price of a baseline
  that keeps meaning what its author meant. (Widths are session-only everywhere, not just
  here.)

- **A filter key that names nothing fails as loudly as its author deserves.** App-authored
  filters — `scope.filters` and **every** `defaultViews` descriptor, selected or not — throw at
  mount:
  `SpeelTable: default view 'Current FY' filter key 'FiscalYear' matches no column or model
field on AuditResponse.` A miss there is a typo in source, versioned with the model, and a
  chip reading "Fiscal Year: 2026" that scopes nothing is worse than a crash. What the user
  carries cannot be fixed by them, so a saved view or a pasted URL warns once per table and key
  and drops that key, while every key that still resolves keeps filtering:
  `[speel] table 'ao-responses': saved view filter key 'FiscalYear' matches no column or model
field — ignored.` A key naming a field the table does not display is **not** a miss — it
  resolves against the model.

- **The name is the address, so renaming a view breaks links to it.** There are no slugs, no
  ids, and no redirect bookkeeping: `.v` carries the name verbatim. A link naming a view nobody
  answers to — renamed, deleted, never shared with this user — warns once and opens the default
  view rather than failing:
  `[speel] table 'ao-responses': url view 'Q3 audit' not found — using the default view.`

- **Names can collide across the three sources, and the order decides.** An app view called
  "Overdue" wins over a personal one, which wins over a shared one — so a link written against
  the app's own vocabulary works whatever the recipient has saved, and a link to _your_
  "Overdue" opens someone else's if they have one too.

- **`.v` is read on arrival, not tracked afterwards.** It resolves once the stores have loaded
  and outranks the user's starting view; editing it by hand later does nothing until a reload.

- **Wait for `loading` before rendering the table.** A starting view cannot be applied until
  the store resolves; rendering the app default first and swapping would visibly re-lay-out the
  table under the user. Filters are known synchronously, so only the layout waits.

- **A failed save keeps your arrangement.** The in-memory state is not reverted and `error` is
  surfaced; the next change retries. Losing a rename to a network blip is annoying; having your
  columns snap back mid-session is worse.

- **URLs are long in SPFx.** Keep `tableId` (or `urlPrefix`) short — it names both params —
  and note that anything equal to its default is omitted from the question. The older
  per-column `<prefix>.f.<col>` / `.s` / `.pg` params are not read at all any more: a bookmark
  from before opens the view it names, or the default, with its question dropped.

- **A new shared-views list lets everyone publish.** speel provisions the list but cannot
  restrict who writes to it: item-level security expresses "only your own items", not "only
  these people", and there is no migration operation for list permissions. **Break inheritance
  on the list and grant Contribute to the group that should curate views.** Until you do,
  anyone with Contribute on the site can publish — and `canPublish` will correctly report that
  they can, because write access _is_ the permission.

- **Sharing is publish-to-everyone, not per-person.** There is no way to share a view with
  named people or a single group; a shared view is visible to everyone who can read the list.
