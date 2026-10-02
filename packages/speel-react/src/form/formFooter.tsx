import { useStore } from "@tanstack/react-form";
import type { FormMode } from "@speel/core";
import { useSpeelUI } from "../context.js";
import type { EntityForm } from "./useEntityForm.js";
import {
  SpeelActionBar,
  type SpeelAction,
  type SpeelActions,
} from "../actions.js";

/** @deprecated Use `SpeelAction<EntityForm>` — the one action type across forms,
 *  surfaces and the MessageBar. */
export type SpeelFormAction = SpeelAction<EntityForm>;

/**
 * Shared footer for the inline form and the surfaces. With `onClose` (surfaces) Save submits
 * via onClick and Cancel/Close call onClose; without it (inline SpeelForm) Save is a native
 * submit button and Cancel returns edit→view.
 */
export function FormFooter(props: {
  ef: EntityForm;
  mode: FormMode;
  setMode: (m: FormMode) => void;
  actions?: SpeelActions<EntityForm>;
  /** False drops the view-mode Edit button (read-only display form). Default true. */
  canEdit?: boolean;
  onClose?: () => void;
  /** Caller notification, fired after Cancel's own reset/mode/close handling. */
  onCancel?: () => void;
}): JSX.Element {
  const { ef, mode, setMode, actions, onClose, onCancel } = props;
  const canEdit = props.canEdit ?? true;
  const ui = useSpeelUI();
  const isSubmitting = useStore(
    ef.form.store,
    (s) => s.isSubmitting as boolean,
  );

  if (actions !== undefined) {
    return <SpeelActionBar actions={actions} ctx={ef} />;
  }
  if (mode === "view") {
    return (
      <>
        {canEdit ? (
          <ui.Button
            text="Edit"
            appearance="primary"
            onClick={() => setMode("edit")}
          />
        ) : null}
        {onClose ? (
          <ui.Button text="Close" appearance="secondary" onClick={onClose} />
        ) : null}
      </>
    );
  }
  return (
    <>
      {/*
        Save stays enabled while the draft is invalid: submit() marks every field
        touched, so the click reveals the field errors + the entity-level message
        instead of dead-clicking a greyed-out button. Validation still blocks the
        save itself. Custom footers that want the old behavior read `ef.canSubmit`.
      */}
      <ui.Button
        text="Save"
        appearance="primary"
        type="submit"
        disabled={isSubmitting}
        {...(onClose ? { onClick: () => void ef.submit() } : {})}
      />
      {isSubmitting ? <ui.Spinner /> : null}
      <ui.Button
        text="Cancel"
        appearance="secondary"
        onClick={() => {
          // While a save is in flight, Cancel aborts it (cooperative — fired
          // requests complete). Once settled, it performs the normal cancel.
          if (isSubmitting) {
            ef.abort();
            return;
          }
          ef.reset();
          if (mode === "edit") setMode("view");
          else onClose?.();
          // Last, so the caller (a panel closing itself) sees a form that has
          // already reverted its draft.
          onCancel?.();
        }}
      />
    </>
  );
}
