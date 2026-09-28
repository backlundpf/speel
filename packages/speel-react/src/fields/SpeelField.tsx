import type { FieldConfig } from "@speel/core";
import { useSpeelUI } from "../context.js";
import { useField } from "../form/useField.js";
import type { FieldHandle } from "../form/FieldHandle.js";
import type { FieldChrome, SpeelUIAdapter } from "../adapter/SpeelUIAdapter.js";
import { formatFieldValue } from "./format.js";
import { LookupDispatchBody } from "./PrincipalFieldBody.js";
import { SelectionFieldBody } from "./SelectionFieldBody.js";
import { RadioChoiceBody } from "./RadioChoiceBody.js";
import { JsonFieldBody } from "./JsonFieldBody.js";

export interface SpeelFieldProps {
  name?: string;
  field?: FieldHandle;
}

/**
 * The field dispatcher: resolves a FieldHandle (by `name` from the surrounding form,
 * or an explicit `field`), then renders it through the injected adapter per the
 * render-override / view-mode decision tree.
 */
export function SpeelField(props: SpeelFieldProps): JSX.Element | null {
  if (props.field) return <RenderField field={props.field} />;
  if (props.name !== undefined) return <BoundField name={props.name} />;
  throw new Error(
    "SpeelField requires either a `name` (inside a form) or a `field` handle.",
  );
}

function BoundField({ name }: { name: string }): JSX.Element | null {
  const field = useField(name);
  return <RenderField field={field} />;
}

function RenderField({ field }: { field: FieldHandle }): JSX.Element | null {
  const ui = useSpeelUI();
  if (!field.visible) return null;

  // 1) render override wins (undefined = fall back to the default body)
  if (field.render !== undefined) {
    return (
      <ui.FieldDisplay label={field.displayName}>
        {field.render}
      </ui.FieldDisplay>
    );
  }
  // 2) Json is dispatched here, ahead of the view/read-only branch below: a shape
  // renders as a FIELDSET of its own properties in every mode (each nested
  // ShapeFieldRow decides input vs. display text off this same field's `mode`), so
  // routing it through the plain formatted-display branch would collapse the whole
  // shape down to just its headline — right for a table cell or a sibling read-only
  // field (that's what formatFieldValue's Json case is for), wrong for this field
  // itself.
  if ((field.config as FieldConfig | undefined)?.kind === "Json") {
    return <JsonFieldBody field={field} chrome={chromeOf(field)} />;
  }
  // 3) view mode or read-only → formatted display (not a disabled input)
  if (field.mode === "view" || field.readOnly) {
    return (
      <ui.FieldDisplay label={field.displayName}>
        {formatFieldValue(field.config as FieldConfig, field.value)}
      </ui.FieldDisplay>
    );
  }
  // 4) input branch
  return renderInput(ui, field);
}

/** Build a clean chrome object (only defined keys — friendly to exactOptionalPropertyTypes). */
function chromeOf(field: FieldHandle): FieldChrome {
  const c: FieldChrome = {
    label: field.displayName,
    required: field.required,
    disabled: !field.enabled,
  };
  const err = field.touched ? field.errors[0] : undefined;
  if (err !== undefined) c.error = err;
  return c;
}

function renderInput(ui: SpeelUIAdapter, field: FieldHandle): JSX.Element {
  const config = field.config as FieldConfig;
  const chrome = chromeOf(field);
  // An inverse collection edits a membership (an array of child objects), so it is
  // always multi, whatever the navigation's own config says.
  if (field.storage === "inverse-fk")
    return <SelectionFieldBody field={field} chrome={chrome} multi />;
  switch (config.kind) {
    case "Text":
      if (config.multiline && config.richText) {
        return (
          <ui.RichTextInput
            {...chrome}
            value={String(field.value ?? "")}
            onChange={(v) => field.setValue(v)}
            onBlur={field.markTouched}
          />
        );
      }
      return (
        <ui.TextInput
          {...chrome}
          value={String(field.value ?? "")}
          onChange={(v) => field.setValue(v)}
          onBlur={field.markTouched}
          multiline={config.multiline}
          {...(config.maxLength !== undefined
            ? { maxLength: config.maxLength }
            : {})}
        />
      );
    case "Number":
      return (
        <ui.NumberInput
          {...chrome}
          // An empty number column is null, and the adapter contract says
          // `number | undefined` — so normalise here rather than casting the
          // null past the type system and leaving each skin to cope.
          value={(field.value ?? undefined) as number | undefined}
          onChange={(v) => field.setValue(v)}
          onBlur={field.markTouched}
          {...(config.min !== undefined ? { min: config.min } : {})}
          {...(config.max !== undefined ? { max: config.max } : {})}
        />
      );
    case "Currency":
      return (
        <ui.NumberInput
          {...chrome}
          // An empty number column is null, and the adapter contract says
          // `number | undefined` — so normalise here rather than casting the
          // null past the type system and leaving each skin to cope.
          value={(field.value ?? undefined) as number | undefined}
          onChange={(v) => field.setValue(v)}
          onBlur={field.markTouched}
          {...(config.min !== undefined ? { min: config.min } : {})}
          {...(config.max !== undefined ? { max: config.max } : {})}
          {...(config.currencyCode !== undefined
            ? { prefix: config.currencyCode }
            : {})}
        />
      );
    case "Boolean":
      return (
        <ui.Checkbox
          {...chrome}
          checked={Boolean(field.value)}
          onChange={(v) => field.setValue(v)}
        />
      );
    case "DateTime":
      return (
        <ui.DatePicker
          {...chrome}
          value={
            field.value instanceof Date
              ? field.value
              : field.value
                ? new Date(field.value as string)
                : undefined
          }
          onChange={(v) => field.setValue(v)}
          showTime={config.displayFormat === "DateTime"}
          {...(config.min !== undefined
            ? { minDate: new Date(config.min) }
            : {})}
          {...(config.max !== undefined
            ? { maxDate: new Date(config.max) }
            : {})}
        />
      );
    case "Choice":
      // The combobox, unless the model opted into radios — the only rendering choice.
      return config.radioButtons ? (
        <RadioChoiceBody field={field} chrome={chrome} />
      ) : (
        <SelectionFieldBody field={field} chrome={chrome} />
      );
    case "Lookup":
      // Two shapes, chosen by `LookupDispatchBody`: a person column (a target
      // whose source is a provider) always gets the people picker — identity is
      // not a condition, it only decides how a pick is resolved; every other
      // lookup is the selection combobox.
      return <LookupDispatchBody field={field} chrome={chrome} />;
    default:
      return (
        <ui.FieldDisplay label={field.displayName}>
          {formatFieldValue(config, field.value)}
        </ui.FieldDisplay>
      );
  }
}
