import { useEffect, useRef, useState } from "react";
import { declaredOptions, type FieldConfig } from "@speel/core";
import { useSpeelUI } from "../context.js";
import type { FieldHandle } from "../form/FieldHandle.js";
import type {
  FieldChrome,
  RadioGroupOther,
} from "../adapter/SpeelUIAdapter.js";
import { useSelectionOptions } from "./useSelectionOptions.js";

type ChoiceConfig = Extract<FieldConfig, { kind: "Choice" }>;

const isEmptyValue = (v: unknown): boolean =>
  v === null || v === undefined || v === "";

/**
 * A Choice declared `asRadioButtons()` — the only rendering opt-in. Every option is on
 * screen at once, so there is nothing to search: the options are the whole list, built
 * through the same pipeline as the combobox's. A thunk-sourced Choice works too; its
 * radios appear once the load lands.
 *
 * A single-select `fillIn` Choice additionally gets an "Other" radio (spec: "Radio
 * Other"). Whether Other is the chosen radio is `otherPicked` — state this body owns,
 * not re-derived from the value each render: an Other picked with an empty box is still
 * Other (a bare re-derivation from "value is non-empty and unmatched" would un-check it
 * the instant the box empties, which is the bug the explicit flag exists to avoid).
 *
 * A literal list makes membership known synchronously (`declaredOptions(config)`), so
 * `otherPicked` starts decided at mount. A thunk source has no such list — `loaded` (the
 * hook's rows before its selection merge, which otherwise always folds the current value
 * in as one of its own entries) is empty until the first load lands, and would make a
 * genuinely declared value look like Other's. For a thunk, `otherPicked` starts `false`
 * (undecided) and an effect corrects it once the first load settles — unless the user
 * has already acted by then, which wins.
 *
 * Afterwards `otherPicked` changes only on an explicit pick: `onSelect` or typing set it
 * true, picking a declared radio sets it false. The typed text lives in this body's own
 * state, untouched by a declared pick, so picking Other again restores it.
 */
export function RadioChoiceBody({
  field,
  chrome,
}: {
  field: FieldHandle;
  chrome: FieldChrome;
}): JSX.Element {
  const ui = useSpeelUI();
  const { options, loaded, loading, identityOf } = useSelectionOptions(
    field,
    "",
    true,
  );
  const config = field.config as ChoiceConfig;
  const showOther = config.fillIn && !config.multi;
  const value = field.value;
  const declared = showOther ? declaredOptions(config) : undefined;

  const [otherPicked, setOtherPickedState] = useState<boolean>(() => {
    if (!showOther || isEmptyValue(value) || declared === undefined)
      return false;
    return !declared.some((o) => identityOf(o) === identityOf(value));
  });
  const [otherText, setOtherText] = useState<string>(
    otherPicked ? String(value) : "",
  );

  // A literal list has nothing left to settle (decided above, synchronously); a thunk
  // source settles once, the first time its load finishes.
  const settledRef = useRef(declared !== undefined);
  const interactedRef = useRef(false);
  useEffect(() => {
    if (settledRef.current || loading) return;
    settledRef.current = true;
    // The user's own pick or typing, even before the load landed, wins over this
    // one-time correction.
    if (interactedRef.current || !showOther || isEmptyValue(value)) return;
    if (!loaded.some((o) => identityOf(o) === identityOf(value))) {
      setOtherPickedState(true);
      setOtherText(String(value));
    }
    // Only `loading`'s true→false edge matters — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const setOtherPicked = (picked: boolean): void => {
    interactedRef.current = true;
    setOtherPickedState(picked);
  };

  // Other owns the current value: drop the merge's own copy of it from the declared
  // radios so it is not shown twice (once as itself, once as Other). Only the merge's
  // copy: a value the list itself declares (typed into Other's box, say) keeps its
  // own radio.
  const visibleOptions =
    otherPicked && !loaded.some((o) => identityOf(o) === identityOf(value))
      ? options.filter((o) => o.key !== identityOf(value))
      : options;

  const other: RadioGroupOther | undefined = showOther
    ? {
        text: otherText,
        selected: otherPicked,
        onTextChange: (text: string) => {
          setOtherText(text);
          setOtherPicked(true);
          field.setValue(text.trim());
        },
        onSelect: () => {
          setOtherPicked(true);
          field.setValue(otherText.trim());
        },
      }
    : undefined;

  return (
    <ui.RadioGroup
      {...chrome}
      value={field.value}
      onChange={(v) => {
        setOtherPicked(false);
        field.setValue(v);
      }}
      options={visibleOptions}
      {...(other !== undefined ? { other } : {})}
    />
  );
}
