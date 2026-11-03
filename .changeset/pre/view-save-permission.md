---
"@speel/react": minor
"@speel/identity": minor
---

Table views no longer offer actions the user can't save (#105). `UserSettingsStore` gains an optional `canWrite()`; `identity.settings` answers it from the user's add permission on the settings list, read once per identity (and retried after a failed read), and `createEntityUserSettingsStore` takes it as an option. `TableViewStore` gains an optional `canSave()`, which the settings-backed view store answers from `canWrite`; both default to yes when omitted. `useTableViews` exposes `canSaveViews` and `canSetStartingView`, and `canEditActive` now also needs `canSaveViews` for a personal view, so a view the user can't save offers no Save, Rename or Delete and keeps column tweaks for the session. The picker hides Save as new view, Publish and Unpublish when views can't be saved, and offers Start on this view on any saved view, shared ones included, when the setting can be written. A failed check counts as no and never breaks the picker.
