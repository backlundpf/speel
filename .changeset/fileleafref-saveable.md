---
"@speel/core": patch
"@speel/migrations-cli": patch
---

`FileLeafRef` is no longer read-only on `SpeelEntity` (and so `SpeelDocument`). Assigning it on a tracked document sends it in the normal staged `saveChangesAsync()` update like any text column, which renames the file, and `FileRef` on the entity follows the new name. On a file upload the `file` option still names the file; `FileLeafRef` is not applied as upload metadata. The migrations snapshot keeps excluding `FileLeafRef`, now by name.
