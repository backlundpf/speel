import { useState } from "react";
import type { IEntity, FormMode, IAddOptions } from "@speel/core";
import { useEntityForm, type EntityFormOptions } from "./useEntityForm.js";
import { EntityFormBody, type FormSection } from "./EntityFormBody.js";
import { FormFooter, type SpeelFormAction } from "./formFooter.js";

export type { SpeelFormAction } from "./formFooter.js";

export interface SpeelFormProps<T extends IEntity = IEntity> {
  entity: T;
  mode?: FormMode;
  fields?: string[];
  exclude?: string[];
  sections?: FormSection[];
  actions?: SpeelFormAction[];
  /** Runs after validation, before persistence. Throw to abort and keep the form open. */
  beforeSubmit?: () => void | Promise<void>;
  /** Caller-owned persistence — see EntityFormOptions.onSubmit. */
  onSubmit?: (
    entity: T,
    ctx: { mode: FormMode; signal: AbortSignal; addOptions: IAddOptions },
  ) => void | Promise<void>;
  onSaved?: (entity: T) => void;
  onCancel?: () => void;
  onError?: (err: unknown) => void;
}

/** Inline CRUD form: the headless EntityFields + a default Save/Cancel/Edit footer. */
export function SpeelForm<T extends IEntity>(
  props: SpeelFormProps<T>,
): JSX.Element {
  const [mode, setMode] = useState<FormMode>(props.mode ?? "edit");
  // Remount on mode change so useEntityForm's onSubmit closure never goes stale.
  return <SpeelFormInner key={mode} {...props} mode={mode} setMode={setMode} />;
}

function SpeelFormInner<T extends IEntity>(
  props: SpeelFormProps<T> & { mode: FormMode; setMode: (m: FormMode) => void },
): JSX.Element {
  const {
    entity,
    mode,
    setMode,
    fields,
    exclude,
    sections,
    actions,
    onSaved,
    onCancel,
    onError,
    beforeSubmit,
    onSubmit,
  } = props;
  const ef = useEntityForm(entity, mode, {
    onSaved: (e) => {
      if (mode === "edit") setMode("view");
      onSaved?.(e as T);
    },
    ...(onError ? { onError } : {}),
    ...(beforeSubmit ? { beforeSubmit } : {}),
    ...(onSubmit
      ? { onSubmit: onSubmit as EntityFormOptions["onSubmit"] }
      : {}),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void ef.submit();
      }}
    >
      <EntityFormBody
        ef={ef}
        {...(sections ? { sections } : {})}
        {...(fields ? { fields } : {})}
        {...(exclude ? { exclude } : {})}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <FormFooter
          ef={ef}
          mode={mode}
          setMode={setMode}
          {...(actions ? { actions } : {})}
          {...(onCancel ? { onCancel } : {})}
        />
      </div>
    </form>
  );
}
