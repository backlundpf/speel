# @speel/pnpjs

## 0.1.0-beta.2

### Minor Changes

- cefb352: `alterField` can change a column's type, new fields join the default view, and narrowing type changes are flagged.

  - **`@speel/pnpjs`:** when an `alterField` spec's SharePoint type differs from the column's live type (Text → Note, Note → Text, Choice → MultiChoice, …), the schema provider rewrites the column's `SchemaXml`, keeping its `ID`, `SourceID`, `Name` and `StaticName`, instead of sending a MERGE that SharePoint rejects. The type change runs on its own after the wave's batch. `addField` now adds the column to the list's default view (`AddFieldToDefaultView`) unless the spec sets `addToDefaultView: false` or `hidden: true`.
  - **`@speel/migrations`:** field builders accept the creation-only options `hidden` and `addToDefaultView`. `spFieldTypeOf`, `alterFieldDataLoss` and `annotateDataLoss` are exported. A narrowing type change (Note → Text truncates values to 255 characters; Text → Number, MultiChoice → Choice and similar may drop values) sets `PlanStep.warning`, and at apply time the step's `step-start`/`step-done` events carry `warning`, `MigrateResult.log` gets a `warn …` line and `console.warn` logs it. The step still runs. The snapshot now records SharePoint type names (`Note`, `MultiChoice`, …) for added fields and moves `typeAsString` on `alterField`.
  - **`@speel/migrations-cli`:** `add` prints a stderr warning for each generated step that may lose data and marks it in the generated file with a `// May lose data: …` comment. `SnapshotDiff` gains `warnings`.
  - **`@speel/react`:** the migrations dashboard shows a `⚠ May lose data` line under a warned step in the run log (mirrored with `console.warn`), and a "may lose data" badge with the reason in the preview panel. New accent token `--speel-accent-warn`.

- 9472f21: People search can use Microsoft Graph as a second source. Pass `graph` (any function that performs a Graph GET and returns the JSON body, such as an `MSGraphClientV3` adapter) to `useSharePointIdentity` or `new SharePointIdentityProvider(sp, { graph })`. `searchPrincipalsAsync` then also finds Entra ID users whose name starts with every typed word in any order ("John Smith", "Smith, John", "Smi Jo"), or whose login or email starts with a single typed word. People-picker results keep their ranking first, Graph results are de-duplicated by login, and `maxResults` applies after the merge. If the Graph call fails, search falls back to the picker. This needs the delegated `User.ReadBasic.All` permission. Without a `graph` source, behaviour is unchanged.

### Patch Changes

- Updated dependencies [cefb352]
- Updated dependencies [eed7911]
- Updated dependencies [eed7911]
- Updated dependencies [9472f21]
  - @speel/migrations@0.1.0-beta.2
  - @speel/core@0.1.0-beta.2
  - @speel/identity@0.1.0-beta.2
