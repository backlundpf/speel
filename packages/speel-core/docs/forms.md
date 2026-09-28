# Forms

## What & when

`@speel/core` provides a framework-agnostic presentation layer: per-field state
predicates (`isRequired`, `isVisible`, `isEnabled`, `isReadOnly`), a composable
validation rule pipeline, and the context shapes that tie them together. Reach for
this page when you are building a form engine — evaluating field state against live
values, collecting validation errors, or understanding how rules compose. `@speel/react`
builds on this surface; see its `forms.md` for the React-specific wrappers.

## Canonical example

This shows the pattern `@speel/react`'s validator uses — but it works in any
framework or test:

```ts
import {
  buildValidations,
  collectErrors,
  resolveState,
  type FieldContext,
  type FormMode,
  type EntityType,
} from "@speel/core";

// et  — resolved via ctx.model.findEntityType(entity.constructor)
//        where ctx is the SpeelContext (from useSpeelContext() in React).
// values — a plain Record<string, unknown> snapshot of current form-field
//           values, keyed by propertyName; not a live entity instance.

// Build a FieldContext from your form-engine's current values snapshot.
function makeCtx(
  values: Record<string, unknown>,
  fieldName: string,
  mode: FormMode,
): FieldContext {
  return { values, value: values[fieldName], mode };
}

// Validate every property of an entity type against a values record.
// Returns { fields, form } — the shape @speel/react passes to TanStack Form
// as its form-level validator return value.
function validateAll(
  et: EntityType,
  values: Record<string, unknown>,
  mode: FormMode,
): { fields: Record<string, string | undefined>; form: string | undefined } {
  const fields: Record<string, string | undefined> = {};

  // Synthesized FK columns land in et.properties. A required lookup stores its
  // required rule on the nav, not on the FK scalar — validating the FK would
  // cause a permanently-failing error because the user never sets it directly.
  const fkColumns = new Set(
    et.navigations().map((n) => n.foreignKey.propertyName),
  );

  for (const prop of et.properties) {
    if (prop.isKey) continue; // Id is server-assigned
    if (fkColumns.has(prop.propertyName)) continue; // driven by nav, not user
    const ctx = makeCtx(values, prop.propertyName, mode);
    fields[prop.propertyName] = collectErrors(buildValidations(prop), ctx)[0];
  }

  for (const nav of et.navigations()) {
    const ctx = makeCtx(values, nav.name, mode);
    fields[nav.name] = collectErrors(
      buildValidations({
        isRequired: nav.isRequired,
        displayName: nav.displayName,
        customValidations: nav.customValidations,
      }),
      ctx,
    )[0];
  }

  // Entity-level rules (cross-field constraints declared with b.hasValidation).
  const entityCtx: FieldContext = { values, value: undefined, mode };
  const form = collectErrors(et.validations, entityCtx)[0];

  return { fields, form };
}
```

## Capabilities

### `FieldContext` and `OptionContext`

Every predicate and validation rule receives a `FieldContext`:

```ts
interface FieldContext<TValues = unknown, TValue = unknown> {
  readonly values: TValues; // plain snapshot of all form values, keyed by propertyName
  readonly value: TValue; // the specific field's current value
  readonly mode: FormMode; // 'create' | 'edit' | 'view' | 'table-view'
}
```

`values` is a plain snapshot — not a live entity instance — so the same predicate works
against a form engine's draft state, a test fixture, or a data-table row.

`OptionContext<TValues>` extends `FieldContext` with `readonly option: unknown` — the
candidate option being tested. It is passed to the `optionsFilter` availability predicate,
which a choice field and a lookup both accept.

### Field state: `resolveState`

`IFieldState` is the shared presentation interface carried by both `Property` and
`INavigation`. The boolean-or-predicate pattern appears on four members:

- `isRequired` — field must have a non-empty value
- `isVisible` — field should be rendered
- `isEnabled` — field should be interactive (always `false` when `isReadOnly` is `true`)
- `isReadOnly` — static flag; server-managed fields (`Created`, `Modified`, `Author`, `Editor`)
  are always `true`

To evaluate any of these against a context:

```ts
import { resolveState } from "@speel/core";

const ctx: FieldContext = { values, value, mode };
const required = resolveState(prop.isRequired, ctx); // boolean
const visible = resolveState(prop.isVisible, ctx); // boolean
```

`resolveState` accepts `boolean | FieldStateFn<unknown>` — a static value returns
as-is; a predicate is called with the context. Declaration of these predicates is covered
in [modeling.md](modeling.md#field-refinements); this page covers consumption.

### Composing validation rules: `buildValidations`

`buildValidations(field)` composes three layers of rules in order:

1. **Required rule** — emitted automatically when `field.isRequired` is truthy.
   Fails when `isEmpty(value)` (null / undefined / empty string / empty array).
   Zero and `false` are not empty.
2. **Config-derived refinement rules** — emitted from the field's `FieldConfig` based
   on declared constraints (`hasMinLength`, `hasMax`, choice membership, etc.).
   Each rule passes when the value is empty, so refinements never block an optional
   empty field — the required rule governs presence.
3. **Custom rules** — declared via `hasValidation(predicate, message)` on the builder;
   stored in `field.customValidations`.

For navigation fields there is no `FieldConfig`, so only layers 1 and 3 apply:

```ts
buildValidations({
  isRequired: nav.isRequired,
  displayName: nav.displayName,
  customValidations: nav.customValidations,
});
```

`refinementRulesFor(config, displayName)` is also exported for cases where you want
only the config-derived rules without the required or custom layers. For choice fields,
membership comparison goes through `config.optionsValue ?? identity` — raw values are
compared by identity when no extractor is declared.

### Collecting errors: `collectErrors`

```ts
const rules = buildValidations(prop); // ValidationRule[]
const ctx: FieldContext = { values, value, mode };
const errors = collectErrors(rules, ctx); // string[] — messages of failing rules
```

`collectErrors` runs every rule and returns the messages of those that fail. An empty
array means the field is valid. The first element is typically shown in a form as the
field error; `@speel/react` uses `errors[0]` for the single-error display pattern.

### Entity-level validation

Cross-field rules declared with `b.hasValidation(predicate, message)` on the entity
builder are stored on `EntityType.validations`. They take a `FieldContext` where
`values` is the full values snapshot and `value` is `undefined`:

```ts
const entityCtx: FieldContext = { values, value: undefined, mode };
const formError = collectErrors(et.validations, entityCtx)[0];
```

A form is fully valid when all field-level rule sets return empty arrays and
`et.validations` produce no errors.

### Built-in rule library

The rule factories exported from `@speel/core` are the building blocks `buildValidations`
uses internally, and are also available for direct use:

- **`requiredRule(isRequired, displayName)`** — required presence check (layer 1).
- **Text bounds** — `minLengthRule(min, name)`, `maxLengthRule(max, name)`.
- **Numeric bounds** — `minRule(min, name)`, `maxRule(max, name)`.
- **Date bounds** — `dateMinRule(isoString, name)`, `dateMaxRule(isoString, name)`.
- **Choice membership** — `choiceMembershipRule(choices, keyOf, multi, name)` — fails
  when the value is not in the declared option set. `buildValidations` omits this rule
  entirely when `config.fillIn` is true, or when the Choice is open (a thunk or a query,
  not a literal list), so the rule itself always enforces membership.
- **`isEmpty(value)`** — the empty-test used by all rules; exported for custom-rule
  authors.

All refinement rules pass when the value is empty — presence is handled separately by
the required rule.

### The options config

A Choice or lookup field's `FieldConfig` also carries the **options surface** — `options`
(a literal list or a `({ db })` thunk), `optionsQueryAsync` (a server query per term),
`optionsQuery` (client-side search), `optionsFilter` (client-side availability, an
`OptionContext` predicate), `optionsValue` / `optionsRender`, and on a lookup
`optionsCreateAsync` (create what the user typed). Every creator also receives the
`OptionsCreatorHost` bag a UI binding fills. How those combine, the stock
`searchesDisplayField()` / `createsByDisplayField()`, and open versus closed Choice
columns are in [selection.md](selection.md). A form engine reads them from the config; it
never has to evaluate a thunk or loader during validation.

## Boundaries & gotchas

- **`FormModel` is not part of the core surface.** The plan document describes a bound
  `FormModel(ctx, entity, mode)` class. That class was never shipped; `resolveState` /
  `collectErrors` / `buildValidations` are the real consumer API. Framework wrappers
  (`useEntityForm` in `@speel/react`) own the binding to a specific form engine.

- **Rules evaluate against the live values snapshot, not the saved entity.** Predicates
  receive `ctx.values` — whatever the form engine passes in at evaluation time. A predicate
  reading `ctx.values.Status` sees the _current draft_ value, not what is persisted; this
  is intentional.

- **`isEnabled` does not compose with `isReadOnly`.** `IFieldState.isEnabled` is the
  predicate from the builder; `IFieldState.isReadOnly` is a static flag. A presenter
  should treat a field as non-interactive when _either_ is active — `resolveState` only
  evaluates one at a time. `@speel/react` checks `isReadOnly` first before evaluating
  `isEnabled`.

- **Navigation FK columns are hidden from form validation.** A required lookup field
  (`hasOne(User, e => e.Owner).isRequired()`) stores its required rule on the nav (`Owner`),
  not on the backing scalar (`OwnerId`). The `@speel/react` validator skips FK columns
  explicitly — validate `nav.name` (the object-valued nav), not the FK property, or you
  will block create-mode submits with a field the user cannot set.

- **Entity-level rules receive `value: undefined`.** The `value` slot in the entity
  `FieldContext` is always `undefined`; predicates must read from `ctx.values`.

- **Field state predicates on navs are declared with the same surface as properties.**
  `isRequired`, `isVisible`, `isEnabled`, `hasValidation`, and `hasDisplayName` are all
  available on relationship builders (`hasOne`/`hasMany`). The compiled nav's
  `INavigation extends IFieldState`, so the same `resolveState` / `buildValidations`
  calls work for both properties and navigations.
