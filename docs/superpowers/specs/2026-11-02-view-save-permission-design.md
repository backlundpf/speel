# Hide view saving from users who can't write their settings — design

Branch: `fix/view-save-permission-105`. Issue: #105. Packages: `@speel/react`,
`@speel/identity`. One spec/plan cycle; docs delta and one changeset before the squash merge.

## Intent

`ViewPicker` offers **Save as new view** to everyone. A user with only Read access to the
site (a SharePoint Visitor) can read views but cannot create the user-settings row a saved
view is, so the click fails with a 403 that surfaces as the picker's error bar. speel already
follows the opposite rule for shared views — "hiding the action is a better failure than
offering one that 403s" (`sharedViewStore.ts`, `docs/table-views.md`) — but the personal side
has nothing to gate on: neither `TableViewStore` nor `UserSettingsStore` can say whether the
current user may write.

**Goals:** a user who cannot write their settings is never offered a picker action that
writes them; every other user sees no change; existing stores (local storage, custom stores)
behave exactly as today; apps get this with no configuration when they use identity's
settings store.

**Non-goals:** gating other `useUserSetting` writes outside the picker; changing
`canPublish`; reacting to permissions that change mid-session (identity already caches the
permission mask per scope for the session); a live check with a read-only account (the test
site's Playwright login has full control — see Verification).

**Anti-goals:** an app-level opt-in that leaves every existing app still showing the
failing action; a failed permission read that takes the whole picker down; naming any
consumer app in code, tests, docs, spec, plan or commits.

## Design

### Who answers (user decision)

Identity answers by itself. The settings list (`UserSetting`, `USER_SETTINGS_LIST`) is
identity's own, and identity can already read the current user's effective permissions on a
list: `authorization.hasPermission("addListItems", list(USER_SETTINGS_LIST))`. Shared views
need the app to answer `canPublish` only because they live in a list the app chooses.

### Contracts

- **`UserSettingsStore`** (`@speel/identity`, `userSettingsStore.ts`) gains an optional
  `canWrite?(): Promise<boolean>` — may the current user create and change their settings?
  Omitted means yes, so the local-storage store and any custom store keep today's behaviour.
- **`createEntityUserSettingsStore(db, options?)`** accepts an optional
  `{ canWrite?: () => Promise<boolean> }` and returns a store with that `canWrite`.
- **`SpeelIdentity`** builds its default settings store
  (`options.settings ?? createEntityUserSettingsStore(db, …)`) with `canWrite` answered by
  `this.authorization.hasPermission("addListItems", list(USER_SETTINGS_LIST))`. An app that
  passes its own `options.settings` keeps whatever that store answers.
- **Checked once** (user decision): the default store's `canWrite` memoizes its answer — the
  first call starts the permission read and every later call, from any table, returns that
  same promise, so a page with several tables reads access once per identity. A rejected read
  is not an answer: it is evicted so the next call retries (the rule `AuthorizationService`
  already applies to its permission masks).
- **`TableViewStore`** (`@speel/react`, `viewStore.ts`) gains an optional
  `canSave?(): Promise<boolean>`, mirroring `SharedTableViewStore.canPublish` but defaulting
  the other way: omitted means yes. `createLocalViewStore()` does not implement it.
- **`createSettingsViewStore(settings)`** implements `canSave` by delegating to
  `settings.canWrite` when present, else yes.
- **`useTableViews`** resolves `viewStore.canSave` and the settings store's `canWrite`
  (`useUserSettingsStore()?.canWrite`, when there is a settings store) in the same
  `Promise.all` as the lists and `canPublish`, so the layout still settles once. It exposes
  two booleans on `TableViews`, each `false` while loading, like `canPublish`:
  - **`canSaveViews`** — the view store may write (answers every action that goes through
    `viewStore.save` / `viewStore.remove`);
  - **`canSetStartingView`** — the starting-view setting may be written. The starting view is
    persisted by `useUserSetting` through the _settings_ store (`UserSettingsProvider`), not
    the view store, so it is gated on that store's `canWrite`; with no settings store it is
    session-only today and stays offered (yes). (My call, from review: gating it on the view
    store would be wrong both ways when an app supplies its own view store.)
- **`canEditActive`** (existing public field) becomes
  `activeView !== undefined && (activeIsShared ? canPublish : canSaveViews)`. That one change
  hides the toolbar **Save** button and Rename/Delete for a personal view the user can't
  save, makes `persistPresentation` (the background save of column and page-size tweaks)
  skip, so tweaks stay session-only and show as pending (the unsaved dot and Discard), as
  on the app default. The field's doc comment is updated to say so. (My call, from review.)

### What the picker hides (user decision: the recommended rule)

Every `ViewPicker` (and toolbar) action that writes the user's settings is hidden when the
store it writes to can't be written — each action is gated on the store it actually uses:

| Action                                                                       | Writes         | Offered when                               |
| ---------------------------------------------------------------------------- | -------------- | ------------------------------------------ |
| Save as new view                                                             | view store     | `canSaveViews`                             |
| Save (toolbar), Rename, Delete — personal view                               | view store     | `canEditActive` (personal: `canSaveViews`) |
| Background save of column / page-size tweaks — personal view                 | view store     | `canEditActive`                            |
| Start on this view (any view)                                                | settings store | `canSetStartingView`                       |
| Publish (moves a personal view to shared: shared save, then personal remove) | both           | `canPublish && canSaveViews`               |
| Unpublish (moves it back: personal save, then shared remove)                 | both           | `canPublish && canSaveViews`               |
| Save for everyone, Rename, Delete — shared view                              | shared store   | `canPublish` (unchanged)                   |

Personal views can exist from before the user lost write access; their actions would 403
too, so they hide as well. "Start on this view" moves out of `ViewPicker`'s `editable`
group so it can hide on its own while a shared view's Rename/Delete stay under
`canPublish`. Publish/Unpublish need both answers so a user who may publish but can't write
personal views never gets a half-done move (a shared copy plus a failed personal remove).
(My calls, from review, applying the approved rule.) Column tweaks
on a view the user can't save stay session-only, as they already are on the app default.

### When the check fails

If `canSave()` or `canWrite()` rejects (the permission read fails), treat it as **no** for this load and do
not fail the picker: lists still load, the error bar does not show for it. Rationale: the
same "hiding beats offering one that fails" rule; a transient failure costs the user the
save action until the next load, not the whole picker. (My call.)

## Verification

- `@speel/identity`: unit tests with the identity test provider — the default settings store's
  `canWrite` is true with `addListItems` on the settings list and false without; a store passed
  via `options.settings` is used as-is; `createEntityUserSettingsStore` without `canWrite`
  answers yes.
- `@speel/react`: `createSettingsViewStore` forwards `canWrite`; `useTableViews` exposes
  `canSaveViews` and `canSetStartingView` (true for local store / stores without the method,
  false when it resolves false or rejects, lists still load on rejection); `canEditActive`
  is false for a personal view when `canSaveViews` is false, and a column tweak there is not
  saved (`viewStore.save` not called) but shows as pending; `ViewPicker` shows each action in
  the table above exactly when its condition holds — including a custom view store without
  `canSave` over a read-only settings store (Start on this view hidden, Save as new view shown)
  — through the fake adapter.
- Acceptance from #105: a user without add permission on the settings list doesn't see Save
  as new view (and with no personal views, no Rename / Delete / Start on this view); a user
  with it sees no change; local and custom stores behave as today.
- Live: the sample's Playwright login has full control, so a read-only live check needs a
  Visitor account the suite doesn't have. Unit coverage carries this; a manual check as a
  Visitor is the user's option. `npm run verify` and `format:check` before push.

## Constraints

- Public repo: no consumer app, org or tenant names anywhere committed.
- Relative imports carry `.js`; optional members added spread-if-defined
  (`exactOptionalPropertyTypes`).
- `@speel/react` imports `UserSettingsStore` as a type from `@speel/identity`; keep it a
  type-only dependency direction as today.
- Docs once, at the end: `packages/speel-react/docs/table-views.md` (store seam, the new
  check, which actions it hides) — at 249 lines, move text rather than grow; and
  `packages/speel-identity`'s settings docs or `packages/speel-react/docs/user-settings.md`,
  wherever `UserSettingsStore` is described (read both and pick the one that owns the
  contract).
- Changeset: `minor` for `@speel/react` and `@speel/identity` (additive optional members).

## Left to the builder

Test file placement; the exact wording of doc comments; whether `canSaveViews` is computed
in the load effect or derived.
