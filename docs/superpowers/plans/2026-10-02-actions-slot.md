# One actions shape + read-only view forms — implementation plan

**Spec:** `docs/superpowers/specs/2026-10-02-actions-slot-design.md` · Branch `feat/actions-slot-42-43-46`

Execution: inline, TDD per task (write failing test → implement → green).

- [ ] **1. Type + renderer.** `packages/speel-react/src/actions.tsx`: `SpeelAction<Ctx>`,
      `SpeelActions<Ctx>`, `isActionArray`, `resolveAppearance`, `SpeelActionBar`. Export from
      `src/index.ts`; `SpeelFormAction` becomes a deprecated alias. Tests: `actions.test.tsx`.
- [ ] **2. Danger appearance.** `ButtonProps.appearance` += `"danger"`; v8 `V8Button` themed red
      primary; fake adapter `data-appearance`. Test in `fluentV8.adapter.test.tsx`.
- [ ] **3. Forms.** `FormFooter` renders `actions` through `SpeelActionBar`; `SpeelForm` /
      `SpeelDocumentForm` prop type `SpeelActions<EntityForm>`. Tests in `SpeelForm.test.tsx`.
- [ ] **4. Surfaces.** `SurfaceContentVariantProps.actions: SpeelActions`; `ContentFooter` uses
      the bar; `MigrationPreviewPanel` moves to `SpeelAction`. Tests in `SpeelSurface.test.tsx`.
- [ ] **5. MessageBar.** `MessageBarProps.actions` + `multiline`; v8 (Fluent `actions` /
      `isMultiline`), fake adapter. Tests.
- [ ] **6. allowEdit.** `FormFooter` `canEdit`; guard `setMode`; thread through SpeelForm,
      SpeelDocumentForm, `SurfaceFormVariantProps`, `SurfaceForm`, `FormRequest` /
      `SurfaceManager`. Tests: no Edit, Close works, predicate sees entity.
- [ ] **7. shadcn skin.** `registry/src/speel-shadcn/fields.tsx`: danger → `destructive`;
      MessageBar actions + multiline. Registry smoke tests,
      `npm --prefix registry run registry:build`, `npm run sync:skin`.
- [ ] **8. Gates.** `npm run verify`; sample builds.
- [ ] **9. Document step.** `forms.md`, `surfaces.md`, `feedback.md`, `skins.md` Capabilities.
- [ ] **10. Changeset (minor), push, PR.**
