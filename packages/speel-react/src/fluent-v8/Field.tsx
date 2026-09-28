import * as React from "react";
import { Label, Text, getTheme } from "@fluentui/react";
import type { ReactNode } from "react";
import type { FieldChrome } from "../adapter/SpeelUIAdapter.js";
import { useStableId } from "./useStableId.js";

/** Build a FieldChrome with only defined keys (friendly to exactOptionalPropertyTypes). */
export function chromeFrom(p: {
  label?: string | undefined;
  required?: boolean | undefined;
  error?: string | undefined;
  description?: string | undefined;
  disabled?: boolean | undefined;
}): FieldChrome {
  const c: FieldChrome = {};
  if (p.label !== undefined) c.label = p.label;
  if (p.required !== undefined) c.required = p.required;
  if (p.error !== undefined) c.error = p.error;
  if (p.description !== undefined) c.description = p.description;
  if (p.disabled !== undefined) c.disabled = p.disabled;
  return c;
}

/**
 * The ids that tie a field's label and help text to its control.
 *
 * Which of them a primitive uses depends on who renders the label. Fluent's own
 * controls (TextField, SpinButton, Dropdown, DatePicker, ChoiceGroup) take a `label`
 * prop and wire `htmlFor`/`aria-labelledby` themselves — correctly, and in ways that
 * differ per control — so those pass `label` down and leave `labelId`/`controlId`
 * alone. The controls this skin builds itself carry `controlId` + `labelId`, and the
 * chrome renders the one `<Label>` that names them.
 */
export interface FieldAria {
  /** Put on the chrome's `<Label>` when the chrome renders it. */
  labelId: string;
  /** Put on a control this skin owns; the chrome's label points `htmlFor` at it. */
  controlId: string;
  /** Ids of the nodes the chrome renders below the control. */
  errorId: string;
  descriptionId: string;
  /** Space-joined ids of whichever of those exist, or undefined when neither does. */
  describedBy: string | undefined;
}

/** Derives the per-field ids. One hook call per field, stable across renders. */
export function useFieldAria(chrome: FieldChrome): FieldAria {
  const base = useStableId();
  const errorId = `${base}-error`;
  const descriptionId = `${base}-description`;
  const ids: string[] = [];
  // Error first: the problem is read before the hint that would have avoided it.
  if (chrome.error !== undefined) ids.push(errorId);
  if (chrome.description !== undefined) ids.push(descriptionId);
  return {
    labelId: `${base}-label`,
    controlId: `${base}-control`,
    errorId,
    descriptionId,
    describedBy: ids.length > 0 ? ids.join(" ") : undefined,
  };
}

/**
 * Uniform Fluent v8 chrome: Label (+required) / control / error / description.
 *
 * `renderLabel={false}` when the control draws its own label — the chrome still owns
 * the error and description, so every field's help text looks the same wherever the
 * name came from.
 */
export function V8Field({
  chrome,
  aria,
  renderLabel = true,
  children,
}: {
  chrome: FieldChrome;
  aria: FieldAria;
  renderLabel?: boolean;
  children: ReactNode;
}): JSX.Element {
  const theme = getTheme();
  return (
    <div>
      {renderLabel && chrome.label !== undefined && (
        <Label
          id={aria.labelId}
          htmlFor={aria.controlId}
          required={!!chrome.required}
          disabled={!!chrome.disabled}
        >
          {chrome.label}
        </Label>
      )}
      {children}
      {chrome.error !== undefined && (
        <Text
          id={aria.errorId}
          role="alert"
          variant="small"
          styles={{ root: { color: theme.semanticColors.errorText } }}
        >
          {chrome.error}
        </Text>
      )}
      {chrome.description !== undefined && (
        <Text
          id={aria.descriptionId}
          variant="small"
          styles={{ root: { color: theme.semanticColors.bodySubtext } }}
        >
          {chrome.description}
        </Text>
      )}
    </div>
  );
}
