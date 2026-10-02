# alterField type changes, data-loss warnings, default-view placement

Issues: #33 (alterField cannot change a column's type), #36 (new fields stay out of
the default view). Owner-approved decisions are recorded inline.

## #36 — addField joins the default view

- `SharePointSchemaProvider.addField` ORs `AddFieldOptions.AddFieldToDefaultView`
  (16) into `AddFieldInternalNameHint` (8) by default.
- `FieldSpecBase` gains `addToDefaultView?: boolean` (creation only) and
  `hidden?: boolean` (creation only, emitted as CAML `Hidden="TRUE"`). Every field
  builder accepts both through its common options. There was no hidden marker on a
  field spec before; it is added so "hidden fields are skipped" has something to key
  on.
- A field is added to the default view unless `addToDefaultView === false` or
  `hidden === true`.
- The fake schema provider does not model views, so the snapshot gains nothing; the
  provider test asserts the Options flag. No backfill builder op: fields added
  before this change are put into the view from a `b.run` step (documented idiom).

## #33 — alterField changes a column's type

- The provider compares the spec's SharePoint type (`Text`, `Note`, `Number`,
  `Currency`, `Boolean`, `DateTime`, `Choice`, `MultiChoice`, `Lookup`,
  `LookupMulti`, `User`, `UserMulti`) with the column's `typeAsString` in the
  snapshot it is handed.
- Same type (or column absent from the snapshot): today's `field.update()`.
- Different type: read the column's `SchemaXml`, rebuild it with
  `fieldSpecToXml` keeping the existing `ID`, `SourceID`, `Name`, `StaticName`
  (and `DisplayName` / `Indexed` when the spec leaves them unset), then
  `field.update({ SchemaXml })`. The read cannot ride the `$batch` (a mid-queue
  await drops the rest of the batch), so retype ops run one by one, unbatched,
  after the wave's batch executes. Results keep op order. Works both ways
  (Text→Note on up, Note→Text on down).
- `applyResultToSnapshot` records SharePoint type names (`Note`, `MultiChoice`,
  …) for addField and updates `typeAsString` on alterField, so later waves and
  migrations in the same run see the column's real type.

## Data-loss warnings

- `@speel/migrations` exports `spFieldTypeOf(spec)` and
  `alterFieldDataLoss(fromType, spec)`; the latter returns a message when a type
  change may lose data, undefined otherwise. Safe widenings: Text→Note,
  Number↔Currency, Number/Currency/Boolean/DateTime/Choice→Text|Note,
  Choice→MultiChoice, MultiChoice→Note, Lookup→LookupMulti, User→UserMulti.
  Every other type change warns; Note→Text names the 255-character truncation.
- Plan: `PlanStep.warning?: string`, computed for every plan by walking the
  steps over the live snapshot's types.
- Apply: the Migrator computes the warning from the live snapshot before sending
  an alterField; the step's `step-start` and `step-done` events carry
  `warning`, `MigrateResult.log` gets a `warn …` line, and `console.warn` logs
  it. The step still runs.
- CLI: `speel-migrations add` writes one stderr warning per generated
  alterField (up or down) that may lose data, and prefixes that line in the
  generated file with a `// May lose data: …` comment.
- Dashboard (`@speel/react` MigrationsManager / MigrationPreviewPanel): the run
  log shows a warning line under the step (warning accent), the devtools mirror
  uses `console.warn`, and the preview shows a "may lose data" badge with the
  message. Mirrored types gain `warning?`. Uses existing adapter primitives — no
  new adapter members.

## Out of scope

Same-type narrowing (a shorter `maxLength`, removed choices) is not detected.
