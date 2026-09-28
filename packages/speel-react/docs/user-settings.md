# User settings

## What & when

`useUserSetting` stores a preference against the person rather than the browser: a theme, a
density, a default filter, a saved table view. Reach for it when a choice should still be there
on a different machine — and reach for [URL state](url-state.md) instead when the thing should
travel in a link. The two are siblings and deliberately share a shape: the query string carries
what is **shareable**, the settings store carries what is **personal**.

Values live in a SharePoint list provisioned with item-level security, so the server returns
only the current user's rows. That is the whole scoping story: no author filter to remember, no
current-user lookup, and no way for a client bug to read or overwrite someone else's settings.

## Canonical example

```tsx
import { SpeelProvider, useUserSetting } from "@speel/react";

// Settings arrive with identity, built alongside the context in the web part.
<SpeelProvider db={ctx} ui={fluentV8Adapter} identity={identity}>
  <Dashboard />
</SpeelProvider>;

// Anywhere beneath it.
function DensityToggle() {
  const [compact, setCompact, ready] = useUserSetting("table.compact", false);
  if (!ready) return null; // avoid flashing the default
  return (
    <Toggle
      checked={compact}
      onChange={(_, v) => setCompact(Boolean(v))}
      label="Compact rows"
    />
  );
}
```

The entity comes from the base class, so there is nothing to register — extend
`IdentityDbContext` from `@speel/identity` instead of `DbContext`, and generate a migration
once per app:

```ts
export class AppContext extends IdentityDbContext {
  public things = this.set(Thing);
}
```

## Capabilities

### The store seam

`UserSettingsStore` is `getAll` / `set` / `remove`, and it lives in `@speel/identity` — the
store is persistence, not UI, and the list it reads is an identity entity. `identity.settings`
is the default implementation, backed by the `UserSetting` list so settings follow the user.

For a per-browser store instead — an app that has not provisioned the list, or a test — pass
`useSettings(createLocalUserSettingsStore())` when building the identity. An app can supply any
object implementing the contract; nothing above the seam knows where settings live.

See [identity's settings page](../../speel-identity/docs/settings.md) for the storage model
itself.

### Reads are synchronous

The provider calls `getAll` once and holds the result in context. Every later read is
synchronous, which is what lets a theme render correctly on the first paint instead of
flashing its default and correcting itself. `ready` reports whether that first load has
resolved, for the components where a flash would still be visible.

### Writes are optimistic and debounced

`set` updates the in-memory value immediately and schedules a write. Repeated changes to one
key collapse into a single call, so a toggle clicked three times costs one round trip rather
than three. A pending write is flushed on `pagehide`, so a change made immediately before
navigating away is not lost.

A failed write keeps the in-memory value and reports through `useUserSettingsStatus()` rather
than reverting under the user; the next change retries.

### One row per key

Each setting is its own row, keyed by the list's built-in `Title` column. Two features writing
different keys never touch the same row, so a theme change in one tab cannot clobber a saved
view in another. Namespace keys by feature — `theme.dark`, `table.view.<tableId>.<viewId>` —
since they share one list.

### Table views on top

`createSettingsViewStore(settings)` implements the table `TableViewStore` against settings keys,
so saved views follow the user instead of living in one browser. `useTableViews` is unchanged;
an app just picks which store to hand it. See [table views](table-views.md).

## Boundaries & gotchas

- **The list must exist before the entity-backed store works.** Register `UserSetting` and run
  the migration; until then use the local store. A missing list surfaces as a failed `getAll`,
  reported through `useUserSettingsStatus()` rather than thrown into render.

- **Item security applies at list creation only.** There is no `updateList` operation, so a
  list provisioned without `readSecurity: 'own'` will not acquire it from a later model change.
  Fix that in SharePoint's list settings, or recreate the list.

- **A crash inside the debounce window loses the last change.** The window is short and
  `pagehide` covers navigation, but a hard crash is not a graceful exit. Do not use this for
  anything that must not be lost — settings are preferences, not data.

- **No cross-tab sync.** Two tabs each hold their own loaded map; the last write to a given key
  wins. One row per key keeps the blast radius to that key rather than the whole settings blob.

- **Settings are not secrets.** They are ordinary list items the user can read and edit in
  SharePoint directly. Do not store anything sensitive, and treat a value read back as
  user-supplied input — a hand-edited row that no longer parses is skipped rather than trusted.

- **`ready` is false forever without a store.** The hook still works — values last for the
  session — so a component need not know how the app is wired, but a `if (!ready) return null`
  guard would render nothing forever. Gate on `ready` only where a flash actually matters.
