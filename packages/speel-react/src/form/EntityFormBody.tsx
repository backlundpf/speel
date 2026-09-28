import type { CSSProperties } from "react";
import { useStore } from "@tanstack/react-form";
import { useSpeelUI, useSpeelConfig } from "../context.js";
import { EntityFormProvider, type EntityForm } from "./useEntityForm.js";
import { EntityFields } from "../fields/EntityFields.js";
import { buildEntityError } from "./validators.js";

/** A titled group of fields rendered as one block inside the form body. */
export interface FormSection {
  title?: string;
  fields: string[];
}

/** Form provider + auto field set + the submit-error MessageBar. Shared by SpeelForm + surfaces. */
export function EntityFormBody(props: {
  ef: EntityForm;
  fields?: string[];
  exclude?: string[];
  sections?: FormSection[];
}): JSX.Element {
  const { ef, fields, exclude, sections } = props;
  const ui = useSpeelUI();
  // Responsive field grid: fields stretch to fill the row, and a new column appears once
  // there's room for another field of the configured min width. Note (multiline) fields opt
  // out and span the full row (handled per-cell in EntityFields).
  const { fieldColumnMinWidth } = useSpeelConfig();
  const FIELD_GRID: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(auto-fit, minmax(${fieldColumnMinWidth}px, 1fr))`,
    gap: "12px 16px",
    alignItems: "start",
  };
  return (
    <EntityFormProvider value={ef}>
      {sections ? (
        <div style={{ display: "grid", gap: 20 }}>
          {sections.map((s, i) => (
            <section key={s.title ?? i} style={{ display: "grid", gap: 8 }}>
              {s.title ? (
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    paddingBottom: 4,
                    borderBottom: "1px solid rgba(0,0,0,0.1)",
                  }}
                >
                  {s.title}
                </div>
              ) : null}
              <div style={FIELD_GRID}>
                <EntityFields fields={s.fields} />
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div style={FIELD_GRID}>
          <EntityFields
            {...(fields ? { fields } : {})}
            {...(exclude ? { exclude } : {})}
          />
        </div>
      )}
      <FormLevelError ef={ef} />
      {ef.submitNotice ? (
        <ui.MessageBar intent="info">{ef.submitNotice}</ui.MessageBar>
      ) : null}
      {ef.submitError ? (
        <ui.MessageBar intent="error">{ef.submitError}</ui.MessageBar>
      ) : null}
    </EntityFormProvider>
  );
}

/**
 * Entity-level validation (`hasValidation` on the entity) rendered as an error region
 * between the fields and the footer — otherwise these rules only block submit, with
 * nothing on screen to explain why. Visibility follows the field rule: silent until the
 * user has touched something (submit marks everything touched). The store subscription
 * stays local so a keystroke re-renders this bar, not the whole form.
 */
function FormLevelError({ ef }: { ef: EntityForm }): JSX.Element | null {
  const ui = useSpeelUI();
  const values = useStore(ef.form.store, (s) => s.values) as Record<
    string,
    unknown
  >;
  if (!Object.values(ef.touched).some(Boolean)) return null;
  const message = buildEntityError(ef.et, values, ef.mode);
  return message ? (
    <ui.MessageBar intent="error">{message}</ui.MessageBar>
  ) : null;
}
