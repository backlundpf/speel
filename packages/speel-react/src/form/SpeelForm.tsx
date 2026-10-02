import { useState } from "react";
import type { IEntity, FormMode, IAddOptions } from "@speel/core";
import { useEntityForm, type EntityFormOptions } from "./useEntityForm.js";
import { EntityFormBody, type FormSection } from "./EntityFormBody.js";
import { FormFooter } from "./formFooter.js";
import type { EntityForm } from "./useEntityForm.js";
import type { SpeelActions } from "../actions.js";

export type { SpeelFormAction } from "./formFooter.js";

/** `allowEdit` as given → whether this entity may enter edit mode. */
export function resolveAllowEdit<T>(
  allowEdit: boolean | ((entity: T) => boolean) | undefined,
  entity: T,
): boolean {
  return typeof allowEdit === "function"
    ? allowEdit(entity)
    : (allowEdit ?? true);
}

export interface SpeelFormProps<T extends IEntity = IEntity> {
  entity: T;
  mode?: FormMode;
  fields?: string[];
  exclude?: string[];
  sections?: FormSection[];
  /** Replaces the built-in footer: an action array (each `onClick` gets the form) or
   *  any node rendered as-is. */
  actions?: SpeelActions<EntityForm>;
  /** Whether view mode offers Edit. False (or a predicate returning false for the
   *  entity) makes a read-only display form: no Edit button, no path into edit
   *  mode. Default true. */
  allowEdit?: boolean | ((entity: T) => boolean);
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
  const [mode, setRawMode] = useState<FormMode>(props.mode ?? "edit");
  const canEdit = resolveAllowEdit(props.allowEdit, props.entity);
  const setMode = (m: FormMode): void => {
    if (m === "edit" && !canEdit) return;
    setRawMode(m);
  };
  // Remount on mode change so useEntityForm's onSubmit closure never goes stale.
  return (
    <SpeelFormInner
      key={mode}
      {...props}
      mode={mode}
      setMode={setMode}
      canEdit={canEdit}
    />
  );
}

function SpeelFormInner<T extends IEntity>(
  props: SpeelFormProps<T> & {
    mode: FormMode;
    setMode: (m: FormMode) => void;
    canEdit: boolean;
  },
): JSX.Element {
  const {
    entity,
    mode,
    setMode,
    fields,
    exclude,
    sections,
    actions,
    canEdit,
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
          canEdit={canEdit}
          {...(actions !== undefined ? { actions } : {})}
          {...(onCancel ? { onCancel } : {})}
        />
      </div>
    </form>
  );
}
