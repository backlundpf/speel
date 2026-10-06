# Plan: `systemGenerated` columns (#38)

Spec: `docs/superpowers/specs/2026-10-02-system-generated-columns-design.md`. TDD: each
task writes its failing test first. Branch `fix/fileleafref-saveable-38`.

- [ ] **0. Rebase.** `git fetch origin && git rebase origin/main` (main moved: the
      beta.2 release). Re-link `node_modules/@speel/*`, rebuild dists.
- [ ] **1. Metadata.** `Property` gains `systemGenerated: boolean` (init optional,
      default `false`); the navigation record gains the same. `testing/properties.ts`
      fixtures updated.
- [ ] **2. Authoring surface.** `FieldOptions.systemGenerated?: boolean` (+ add to
      REFINEMENT_KEYS); field-state draft carries `systemGenerated` and tracks whether
      `readOnly` was set explicitly; `FieldRefinementBuilder.isSystemGenerated(value =
true)`; `INavConfig.systemGenerated?` and the `@ManyToOne`/relationship option bag.
- [ ] **3. Resolution.** Wherever a draft becomes a `Property` / nav record
      (`FieldBuilderBase`, `FieldStateBuilder.buildFieldState`, `ModelBuilder` nav + FK
      property construction): `readOnly = explicitReadOnly ?? systemGenerated`, and FK
      columns synthesized for a `systemGenerated` nav inherit both flags. Tests: decorator
      and fluent, field and nav; default, explicit clear, `readOnly` alone.
- [ ] **4. Built-ins.** `SpeelEntity`: `systemGenerated: true` on Created, Modified,
      Author, Editor, FSObjType, FileDirRef, FileRef, FileLeafRef (drop explicit
      `readOnly`; FileLeafRef back to TS `readonly`). `SpeelDocument`: FileSize and
      CheckedOutBy `systemGenerated: true`; redeclare `FileLeafRef` with
      `{ systemGenerated: true, readOnly: false, visible: false }` + `override`. Update the
      class doc comments. Tests in `SpeelDocument.test.ts`.
- [ ] **5. Snapshot.** `speel-migrations-cli/src/snapshot.ts` `fieldsFor`: skip
      `p.systemGenerated` / `nav.systemGenerated`; delete `WRITABLE_BUILT_INS` and update the
      doc comment. Tests: no built-in provisioned for list or document entities; a
      `readOnly`-only column is provisioned; a custom `systemGenerated` column is not.
- [ ] **6. Save path.** Keep the branch's `SaveExecutor` FileRef refresh, the upload
      metadata filter and the `FakeStorageProvider` rename; adjust
      `SaveExecutor.fileLeafRef.test.ts` to use a `SpeelDocument` and add: a list entity's
      `FileLeafRef` change is not sent.
- [ ] **7. Gates.** `npm run verify`, `npm run format:check` (prettier idempotent),
      spfx-sample builds.
- [ ] **8. Document step.** `modeling.md`, `saving.md`, migrations `workflow.md` per the
      spec; no page grows past what is needed.
- [ ] **9. Changeset + PR.** Replace the patch changeset with **minor** for `@speel/core`
      and `@speel/migrations-cli`, including the migration note. Rewrite the PR title/body
      (squash message, one 🤖 line). Force-push with lease; CI green; do not merge.
