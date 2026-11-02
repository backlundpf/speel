# Hide view saving from users who can't write their settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #105: the view picker never offers an action that writes the user's settings to a user who can't write them.

**Architecture:** Two optional "may I write?" questions — `UserSettingsStore.canWrite` (identity answers it for its own store, memoized) and `TableViewStore.canSave` (the settings-backed view store forwards `canWrite`). `useTableViews` loads both with the lists, exposes `canSaveViews` / `canSetStartingView`, and folds `canSaveViews` into `canEditActive`; `ViewPicker` gates each action on the store it writes to.

**Tech Stack:** TypeScript (exactOptionalPropertyTypes), React 17, Vitest + Testing Library; `@speel/identity`, `@speel/react`.

**Spec:** `docs/superpowers/specs/2026-11-02-view-save-permission-design.md`

## Global Constraints

- Branch `fix/view-save-permission-105`; public repo — no consumer app/org/tenant names anywhere committed.
- Relative imports carry `.js`; optional members spread-if-defined.
- Omitted `canWrite` / `canSave` mean **yes**; a rejected check means **no** for that load and never fails the picker.
- Identity's default store checks `addListItems` on `list(USER_SETTINGS_LIST)` **once** per identity (memoized promise; evicted on rejection).
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gates: identity — `cd packages/speel-identity && npx tsc -p tsconfig.json --noEmit && npx vitest run`; react — `cd packages/speel-react && npx tsc -p tsconfig.json --noEmit && npx tsc -p tsconfig.test.json --noEmit && npx vitest run` (rebuild `@speel/identity` first: `npm run build --workspace @speel/identity`).

## Review Focus

1. **Several tables on one page** each asking `canWrite`: one permission read in total. → Task 1 `reads access once across calls`.
2. **A rejected permission read**: the picker's lists still load and no error shows; the next load retries. → Task 1 `retries after a failed read`, Task 3 `a rejected check is no, and the lists still load`.
3. **An app's own view store with no `canSave` over a read-only identity settings store**: Save as new view offered, Start on this view hidden. → Task 3 `custom view store, read-only settings`.
4. **A column tweak on a personal view the user can't save**: not written, shown as pending. → Task 3 `does not save tweaks it can't write`.
5. **A user who may publish but can't save personal views**: neither Publish nor Unpublish offered. → Task 4 `publish needs both answers`.

---

### Task 1: `UserSettingsStore.canWrite`, answered once by identity

**Files:**

- Modify: `packages/speel-identity/src/userSettingsStore.ts` (interface ~:12, `createEntityUserSettingsStore` ~:67)
- Modify: `packages/speel-identity/src/SpeelIdentity.ts` (~:177 `this.settings = …`)
- Test: `packages/speel-identity/test/settings.test.ts`

**Interfaces:**

- Produces: `UserSettingsStore.canWrite?: () => Promise<boolean>`; `createEntityUserSettingsStore(db: DbContext, options?: { canWrite?: () => Promise<boolean> }): UserSettingsStore`.

- [ ] **Step 1: Failing tests** (build with `FakeIdentityProvider`, seed via `ids.seedPermissions({ kind: "list", list: USER_SETTINGS_LIST }, [...])`):
  - `canWrite is true with addListItems on the settings list` / `false without it` (seed `["viewListItems"]`).
  - `reads access once across calls` — three `canWrite()` calls (two concurrent, one after) → `ids.reads.filter((r) => r.includes(USER_SETTINGS_LIST))` has length 1.
  - `retries after a failed read` — first `getEffectivePermissionsAsync` rejects, second resolves with the permission: first `canWrite()` rejects, second resolves `true`.
  - `a store passed with useSettings is used as-is` — `useSettings(createLocalUserSettingsStore())` → `identity.settings.canWrite` is `undefined`.
  - `createEntityUserSettingsStore without canWrite answers nothing` — `.canWrite` is `undefined`.
- [ ] **Step 2:** `cd packages/speel-identity && npx vitest run test/settings.test.ts` → FAIL.
- [ ] **Step 3:** Add the member and option (spread-if-defined). In `SpeelIdentity`, when `options.settings` is absent, pass a memoized `canWrite`: hold one `Promise<boolean> | undefined`; on first call set it to `this.authorization.hasPermission("addListItems", list(USER_SETTINGS_LIST))`; on rejection clear it only if it is still the held promise.
- [ ] **Step 4:** Re-run → PASS; identity gate green.
- [ ] **Step 5: Commit** `feat(identity): UserSettingsStore.canWrite, checked once for identity's store (#105)`

### Task 2: `TableViewStore.canSave`, forwarded by the settings view store

**Files:**

- Modify: `packages/speel-react/src/table/views/viewStore.ts` (`TableViewStore` ~:33)
- Modify: `packages/speel-react/src/table/views/settingsViewStore.ts`
- Test: `packages/speel-react/test/settingsViewStore.test.ts`

**Interfaces:**

- Consumes: Task 1's `UserSettingsStore.canWrite`.
- Produces: `TableViewStore.canSave?: () => Promise<boolean>`; `createSettingsViewStore` sets `canSave` exactly when `settings.canWrite` exists.

- [ ] **Step 1: Failing tests:** `forwards canWrite as canSave` (a settings store whose `canWrite` resolves false → `await store.canSave!()` is false); `no canWrite, no canSave` (`createSettingsViewStore(createLocalUserSettingsStore()).canSave` is undefined).
- [ ] **Step 2:** rebuild identity; `npx vitest run test/settingsViewStore.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5: Commit** `feat(react): TableViewStore.canSave, forwarded from the settings store (#105)`

### Task 3: `useTableViews` loads and applies both answers

**Files:**

- Modify: `packages/speel-react/src/table/views/useTableViews.ts` (`TableViews` ~:85, load effect ~:270, `canEditActive` ~:382, `saveAs` / `setStartingView` ~:671 / `publish` ~:682 / `unpublish`)
- Test: `packages/speel-react/test/useTableViews.permissions.test.tsx` (new; harness like `useTableViews.test.tsx`'s `renderProbe`, but taking the settings store too)

**Interfaces:**

- Consumes: Task 2's `canSave`; Task 1's `canWrite` via `useUserSettingsStore()`.
- Produces on `TableViews`: `canSaveViews: boolean`, `canSetStartingView: boolean` (both `false` while loading); `canEditActive = activeView !== undefined && (activeIsShared ? canPublish : canSaveViews)`.

- [ ] **Step 1: Failing tests** (probe renders `canSaveViews`, `canSetStartingView`, `canEditActive`, view count, error):
  - `stores without the methods answer yes` — local view store, local settings → both true.
  - `canSave false: no saving, and canEditActive is false on a personal view` — store with one stored view and `canSave: () => Promise.resolve(false)`; switch to it → `canSaveViews` false, `canEditActive` false.
  - `does not save tweaks it can't write` — same store with a `save` spy; change a column on the active personal view → `save` not called, `pendingDefaultEdits` or `dirty` true.
  - `a rejected check is no, and the lists still load` — `canSave` rejects → `canSaveViews` false, view count 1, error empty.
  - `custom view store, read-only settings` — `useSettings({ ...createLocalUserSettingsStore(), canWrite: () => Promise.resolve(false) })`, custom view store without `canSave` → `canSaveViews` true, `canSetStartingView` false.
  - `the default store follows the settings` — no `viewStore` option, settings `canWrite` false → `canSaveViews` false.
- [ ] **Step 2:** `npx vitest run test/useTableViews.permissions.test.tsx` → FAIL.
- [ ] **Step 3:** Add both to the load `Promise.all` (each wrapped `.catch(() => false)`; absent method → `Promise.resolve(true)`); derive `canEditActive`; guard `saveAs` (`canSaveViews`), `setStartingView` (`canSetStartingView`), `publish` / `unpublish` (`canPublish && canSaveViews`) as early returns; update `canEditActive`'s doc comment.
- [ ] **Step 4:** Re-run → PASS; `npx vitest run test/useTableViews*.test.tsx test/ViewPicker.test.tsx` PASS (add the two new fields to `ViewPicker.test.tsx`'s `views()` fake, `true` by default).
- [ ] **Step 5: Commit** `fix(react): useTableViews knows whether views and the starting view can be saved (#105)`

### Task 4: `ViewPicker` gates each action on the store it writes to

**Files:**

- Modify: `packages/speel-react/src/table/views/ViewPicker.tsx` (~:120-175)
- Test: `packages/speel-react/test/ViewPicker.test.tsx`

**Interfaces:**

- Consumes: Task 3's `canSaveViews`, `canSetStartingView`, `canEditActive`.

- [ ] **Step 1: Failing tests** (`views({...})` overrides, open the menu):
  - `hides Save as new view when views can't be saved` (`canSaveViews: false`).
  - `offers Start on this view on any saved view the setting can be written for` — shared active view, `canPublish: false`, `canEditActive: false`, `canSetStartingView: true` → item present; Rename/Delete absent.
  - `hides Start on this view when the setting can't be written` (`canSetStartingView: false`, personal editable view) → absent; Rename/Delete present.
  - `publish needs both answers` — personal view, `canPublish: true`, `canSaveViews: false` → no "Publish to everyone"; shared view, same → no "Unpublish".
  - existing tests still pass with the defaults.
- [ ] **Step 2:** `npx vitest run test/ViewPicker.test.tsx` → FAIL.
- [ ] **Step 3:** Save-as item behind `v.canSaveViews`; Publish/Unpublish behind `v.canPublish && v.canSaveViews`; move "Start on this view" out of the `editable` group, shown when `v.activeView !== undefined && v.canSetStartingView`.
- [ ] **Step 4:** Re-run → PASS; react gate green.
- [ ] **Step 5: Commit** `fix(react): ViewPicker offers only the view actions the user can save (#105)`

### Task 5: Docs, changeset, verify, PR

**Files:**

- Modify: `packages/speel-react/docs/table-views.md` (store seam + which actions hide; at 249 lines — move text, don't grow), `packages/speel-react/docs/user-settings.md` (or identity's settings doc, whichever describes `UserSettingsStore`: `canWrite`, identity answers once)
- Create: `.changeset/view-save-permission.md` — `"@speel/react": minor`, `"@speel/identity": minor`

- [ ] **Step 1:** Update Capabilities; re-verify examples against each package's `src/index.ts`; keep four H2s and 100–250 lines.
- [ ] **Step 2:** Changeset.
- [ ] **Step 3:** `npm run verify` → exit 0; `npm run format:check` clean (bar the git-ignored `samples/spfx-sample/.auth/`).
- [ ] **Step 4: Commit** `docs: view saving follows settings write access (#105)`; push; open the PR (closes #105).
