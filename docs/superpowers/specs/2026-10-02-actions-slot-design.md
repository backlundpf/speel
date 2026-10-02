# One actions shape (forms, surfaces, MessageBar) + read-only view forms — design

Date: 2026-10-02 · Status: approved (owner decisions relayed in the task brief) · Issues: #42, #43, #46

## Goal

Every place `@speel/react` offers an action row takes the same prop:
`actions?: SpeelAction[] | ReactNode`. An array renders as skin buttons; a node renders
as-is in the skin's footer/action slot. Destructive actions get a first-class `danger`
appearance. View-mode forms can be made read-only (no Edit path).

## Decisions

| Topic           | Decision                                                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type            | One type, `SpeelAction<Ctx = void>` (new, `src/actions.tsx`). `onClick?: (ctx: Ctx) => void`. Forms use `SpeelAction<EntityForm>` (onClick gets the form, as today); surfaces and MessageBar use `SpeelAction` (no argument). `SpeelFormAction` stays as a deprecated alias of `SpeelAction<EntityForm>`.                                                                    |
| Prop            | `SpeelActions<Ctx> = readonly SpeelAction<Ctx>[] \| ReactNode` on `SpeelForm`, `SpeelDocumentForm`, the surface content variant (`SpeelModal`/`SpeelPanel`), and adapter `MessageBarProps`.                                                                                                                                                                                  |
| Array vs node   | An array whose every element is a plain (non-element) object with `key` + `text` is an action array; `[]` is an (empty) action array, so `actions={[]}` keeps meaning "no buttons". Anything else is a node.                                                                                                                                                                 |
| Appearance      | `appearance?: "primary" \| "secondary" \| "subtle" \| "danger"`; `primary: true` is shorthand for `"primary"`; default `"secondary"`. Explicit `appearance` wins.                                                                                                                                                                                                            |
| Danger          | `ButtonProps.appearance` gains `"danger"`. v8: `PrimaryButton` themed from the active theme's red palette. shadcn: the `destructive` variant. Fake adapter exposes `data-appearance`.                                                                                                                                                                                        |
| Align           | Per-action `align?: "start" \| "end"` (default end). Only when some action is start-aligned does the renderer wrap the row in a full-width flex box with start actions, a spacer, then end actions — otherwise the output is unchanged.                                                                                                                                      |
| Renderer        | Exported `<SpeelActionBar actions ctx? />` resolves the union through the current skin's `Button`. Form and content footers use it; skins use it inside `MessageBar` so they need not reimplement the array form.                                                                                                                                                            |
| MessageBar      | `actions?: SpeelActions` and `multiline?: boolean`. v8 forwards the rendered bar to Fluent's `actions` and `multiline` to `isMultiline` (Fluent default, multiline, kept when unset). shadcn: actions below the text (multiline, default) or right-aligned on one line (`multiline: false`).                                                                                 |
| allowEdit (#46) | `allowEdit?: boolean \| ((entity: T) => boolean)`, default `true`, on `SpeelForm`, `SpeelDocumentForm`, the surface form variant and `showForm`/`showDocumentForm` requests. When it resolves false, the default view footer drops Edit (Close stays on surfaces) and the forms' `setMode("edit")` is a no-op guard. It does not override an explicit initial `mode="edit"`. |

## Out of scope

Actions for the surface _form_ variant (it keeps the built-in footer); restructuring
`forms.md` (split pending elsewhere).

## Testing

Fake-adapter tests (vitest/RTL): node actions render as-is in forms, surfaces, MessageBar;
`appearance`/`primary` resolution incl. `danger`; `align: "start"` order; MessageBar
array actions click; `allowEdit` false/predicate on SpeelForm, SpeelDocumentForm, panel
form variant (no Edit, Close works, predicate receives the entity). v8 adapter test:
danger renders a primary button; MessageBar renders actions. Registry smoke test for the
shadcn danger variant and MessageBar actions.
