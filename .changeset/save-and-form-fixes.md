---
"@speel/core": patch
"@speel/react": patch
---

Fixes found while exploring a speel-wide result type (#119), which was not adopted:

- `saveChangesAsync`: an edit made to an entity while its write is in flight is no longer adopted as clean and dropped. Each written entry's originals are now the values the write sent.
- `copyFileToAsync` checks and trims its new name as `renameFileAsync` does: an empty name or one that is a path throws `InvalidOperationException` before anything is sent.
- Edit forms (`useEntityForm` in edit mode, `SpeelForm`) on a loaded row the context does not track used to save nothing and report success. They now attach the row and send only the edited columns. A form on a copy of a tracked row copies its edits onto the tracked entry.
