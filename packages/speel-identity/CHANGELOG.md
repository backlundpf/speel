# @speel/identity

## 0.1.0-beta.6

### Minor Changes

- b532be9: Table views no longer offer actions the user can't save (#105). `UserSettingsStore` gains an optional `canWrite()`; `identity.settings` answers it from the user's add permission on the settings list, read once per identity (and retried after a failed read), and `createEntityUserSettingsStore` takes it as an option. `TableViewStore` gains an optional `canSave()`, which the settings-backed view store answers from `canWrite`; both default to yes when omitted. `useTableViews` exposes `canSaveViews` and `canSetStartingView`, and `canEditActive` now also needs `canSaveViews` for a personal view, so a view the user can't save offers no Save, Rename or Delete and keeps column tweaks for the session. The picker hides Save as new view, Publish and Unpublish when views can't be saved, and offers Start on this view on any saved view, shared ones included, when the setting can be written. A failed check counts as no and never breaks the picker.

### Patch Changes

- @speel/core@0.1.0-beta.6

## 0.1.0-beta.5

### Patch Changes

- @speel/core@0.1.0-beta.5

## 0.1.0-beta.4

### Patch Changes

- Updated dependencies [ec04f47]
  - @speel/core@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- Updated dependencies [74d9aea]
- Updated dependencies [1f75380]
- Updated dependencies [7e20c89]
  - @speel/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- 9472f21: `applySecurables` now leaves a newly broken securable holding exactly what the plan grants. A no-copy break makes SharePoint give the calling user Full Control, which the apply never revoked. It now revokes that assignment in one follow-up save after the grants, unless the plan grants the caller that role. The caller and the Full Control role (found by role type, so localised names work) are resolved once per apply, before anything is sent. A securable whose own operations did not all land keeps the caller's assignment, so a re-run can still converge it.
- Updated dependencies [eed7911]
- Updated dependencies [eed7911]
  - @speel/core@0.1.0-beta.2
