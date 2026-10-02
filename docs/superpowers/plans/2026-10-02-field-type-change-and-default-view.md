# alterField type changes + default view — plan

**Spec:** `docs/superpowers/specs/2026-10-02-field-type-change-and-default-view-design.md`

Each task: failing test first, then code, then the package's tests.

1. **@speel/migrations — field spec + builders.** `hidden?`, `addToDefaultView?` on
   `FieldSpecBase`; `CommonOpts` passes them through. Test: FieldSpecBuilder.
2. **@speel/migrations — data-loss rules.** `src/plan/dataLoss.ts`:
   `spFieldTypeOf`, `alterFieldDataLoss`, `annotateDataLoss(snapshot, steps)`.
   Export from index. Tests: table of conversions.
3. **@speel/migrations — snapshot fold.** addField records `spFieldTypeOf`;
   alterField updates `typeAsString`. Tests: SchemaSnapshot.
4. **@speel/migrations — Migrator.** `PlanStep.warning` via `annotateDataLoss` in
   `finish`; `runOps` computes warnings before apply, emits them on step events,
   logs `warn …`, `console.warn`s. `MigrationEvent` step-start/step-done gain
   `warning?`. Tests: plan + progress.
5. **@speel/pnpjs — provider.** `fieldSpecToXml` takes optional identity attrs
   (ID, SourceID, Name, StaticName) and emits `Hidden`; `retypeFieldXml(current,
   spec, snapshot)`; addField Options |= AddFieldToDefaultView unless opted out or
   hidden; alterField with a type change reads SchemaXml and updates it unbatched
   after `execute()`. Tests: fieldSpecToXml, provider (both directions, ordering,
   failure isolation, options flag).
6. **@speel/migrations-cli.** `SnapshotDiff.warnings?`; emit prefixes a comment;
   `runAdd` reports through a `warn` callback (stderr by default). Tests: diff,
   emit, commands.
7. **@speel/react dashboard.** Mirrored types gain `warning?`; log shows a warning
   line; console mirror warns; preview badge + message; `ACCENT.warn`. Tests.
8. **Docs + changeset + verify.** migrations authoring/runtime pages, pnpjs
   schema page, migrations-ui page; minor changeset; `npm run verify`.
