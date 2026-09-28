import type { FieldConfig, FormMode } from "@speel/core";
import { patchShapeInstance, shapeValueErrors } from "@speel/core";
import type { FieldHandle } from "../form/FieldHandle.js";
import type { FieldChrome } from "../adapter/SpeelUIAdapter.js";
import { useSpeelUI } from "../context.js";
import { ShapeFieldRow } from "./ShapeFieldRow.js";

type JsonConfig = Extract<FieldConfig, { kind: "Json" }>;

/**
 * A stable key per repeater row, keyed off the element instance rather than its
 * array position: with an index key, removing or reordering an element makes
 * React reuse the DOM/state of the wrong array slot for the row that lands there —
 * dragging focus, and any in-flight edit, onto the wrong element. The WeakMap
 * leaks nothing: an element instance dropped from every field's array becomes
 * unreachable and is collected along with its entry.
 */
const ROW_KEYS = new WeakMap<object, string>();
let nextRowKey = 0;
function rowKey(instance: object): string {
  let key = ROW_KEYS.get(instance);
  if (key === undefined) {
    key = `row-${nextRowKey++}`;
    ROW_KEYS.set(instance, key);
  }
  return key;
}

/**
 * A Json field's body: the shape's visible properties rendered as a fieldset of
 * ordinary fields (single value) — Task 5 adds the repeater for a multi value.
 *
 * Dispatched from `SpeelField` for BOTH the input and the view/read-only cases (see
 * the comment at that call site): each nested `ShapeFieldRow` already carries the
 * field's `mode`, so it renders as an input or as display text on its own — the
 * parent's formatted-text branch would instead collapse the whole shape down to just
 * its headline, which is the view-mode/read-only path `formatFieldValue` already
 * owns for a Json CELL (a table, a sibling read-only field), not for this fieldset.
 */
export function JsonFieldBody({
  field,
  chrome,
}: {
  field: FieldHandle;
  chrome: FieldChrome;
}): JSX.Element {
  const ui = useSpeelUI();
  const config = field.config as JsonConfig;
  const shape = config.shape;
  const visible = shape.properties.filter((p) => p.visible !== false);
  // A read-only Json field reads as text, exactly as every other read-only field
  // does. `SpeelField` owns that decision for the rest of them in one place
  // (`mode === "view" || readOnly` → formatted display), but a Json field is
  // dispatched here AHEAD of that branch — so `readOnly` has to be folded into the
  // mode the nested rows are given, or they would render as greyed-out inputs
  // nobody can type into.
  const mode: FormMode = field.readOnly ? "view" : field.mode;
  const enabled = field.enabled;

  // The parent field's own error (e.g. a `required` rule on the Json property
  // itself) wins; otherwise fall back to the shape-level summary — a nested
  // property's own message is shown on its own row, but the parent form never sees
  // that state without this (see shapeValueErrors' doc comment).
  //
  // Both are gated on `field.touched`, same as `chromeOf` gates `chrome.error`
  // itself (`field.touched ? field.errors[0] : undefined`) — a blank required
  // nested property must not accuse the user of a mistake before they've had a
  // chance to make one. A Json field's own `touched` never flips from a nested
  // row's blur (each `ShapeFieldRow` is a standalone field whose `markTouched` is
  // a no-op — there is no parent form to notify), only from `markAllTouched()` on
  // a submit attempt — so this message can appear on first paint of a form
  // whose submit already failed once, but never before that.
  //
  // `shapeValueErrors` is called lazily, inside the `??`, rather than computed up
  // front: it builds every property's validation rules and runs them over every
  // element, which for a fifty-row repeater is hundreds of rule constructions — on
  // every keystroke, since each edit re-renders this component. Untouched, or with
  // the field's own error already winning, the result could never be shown anyway.
  const errorMessage = field.touched
    ? (chrome.error ?? shapeValueErrors(shape, field.value, config.multi)[0])
    : undefined;
  // Spread rather than name `label`/`required` individually: chrome.label's
  // declared type is `string | undefined` (FieldChrome), and exactOptionalPropertyTypes
  // rejects handing that to FieldDisplayProps' `label?: string` by explicit name even
  // though it is always a real string at this call site — a spread carries the key's
  // actual presence/absence across instead, the same way chromeOf's own callers do.
  const display: FieldChrome = {
    ...chrome,
    ...(errorMessage !== undefined ? { error: errorMessage } : {}),
  };

  if (!config.multi) {
    const instance = (field.value ??
      new (shape.ctor as new () => object)()) as object;
    return (
      <ui.FieldDisplay {...display}>
        {visible.map((p) => (
          <ShapeFieldRow
            key={p.propertyName}
            property={p}
            value={(instance as Record<string, unknown>)[p.propertyName]}
            mode={mode}
            enabled={enabled}
            touched={field.touched}
            onChange={(next) =>
              field.setValue(
                patchShapeInstance(shape, instance, {
                  [p.propertyName]: next,
                }),
              )
            }
          />
        ))}
      </ui.FieldDisplay>
    );
  }

  // The repeater: the same fieldset-of-rows as the single case, once per element,
  // plus add/remove/reorder. `elements` is never undefined past this point — an
  // absent value reads as an empty list, the same way `!config.multi` above
  // defaults to a fresh instance rather than rendering nothing.
  const elements = (field.value ?? []) as object[];
  // Mirrors the single case's own input-vs-display split (each ShapeFieldRow
  // already renders read-only off `mode`): view mode never gets the management
  // controls, and neither does a disabled field — there is nothing to add, remove
  // or reorder if the field itself cannot be edited. A read-only field is covered
  // by the same test, since `mode` above already reads "view" for one.
  const canManage = mode !== "view" && enabled;

  const replaceAt = (index: number, next: object): void => {
    const previous = elements[index]!;
    // Carry the outgoing instance's row key onto its replacement — patchShapeInstance
    // always returns a NEW object, so without this an edit would look like the row
    // at `index` got swapped for an unrelated one and remount, taking focus with it.
    const key = ROW_KEYS.get(previous);
    if (key !== undefined) ROW_KEYS.set(next, key);
    field.setValue(elements.map((e, i) => (i === index ? next : e)));
  };

  const addRow = (): void => {
    field.setValue([...elements, new (shape.ctor as new () => object)()]);
  };

  const removeAt = (index: number): void => {
    field.setValue(elements.filter((_, i) => i !== index));
  };

  const move = (index: number, to: number): void => {
    const next = [...elements];
    const [moved] = next.splice(index, 1);
    next.splice(to, 0, moved!);
    field.setValue(next);
  };

  return (
    <ui.FieldDisplay {...display}>
      {elements.map((instance, index) => (
        <fieldset key={rowKey(instance)}>
          <legend>{`Element ${index + 1}`}</legend>
          {visible.map((p) => (
            <ShapeFieldRow
              key={p.propertyName}
              property={p}
              value={(instance as Record<string, unknown>)[p.propertyName]}
              mode={mode}
              enabled={enabled}
              touched={field.touched}
              onChange={(next) =>
                replaceAt(
                  index,
                  patchShapeInstance(shape, instance, {
                    [p.propertyName]: next,
                  }),
                )
              }
            />
          ))}
          {canManage ? (
            <div>
              <ui.IconButton
                iconName="ChevronUp"
                title={`Move element ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              />
              <ui.IconButton
                iconName="ChevronDown"
                title={`Move element ${index + 1} down`}
                disabled={index === elements.length - 1}
                onClick={() => move(index, index + 1)}
              />
              <ui.IconButton
                iconName="Delete"
                title={`Remove element ${index + 1}`}
                onClick={() => removeAt(index)}
              />
            </div>
          ) : null}
        </fieldset>
      ))}
      {canManage ? <ui.Button text="Add" onClick={addRow} /> : null}
    </ui.FieldDisplay>
  );
}
