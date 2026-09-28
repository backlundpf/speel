import { useState } from "react";
import { useStore } from "@tanstack/react-form";
import type { FormMode, SpeelDocument } from "@speel/core";
import { useEntityForm, type EntityFormOptions } from "./useEntityForm.js";
import { EntityFormBody } from "./EntityFormBody.js";
import { FormFooter } from "./formFooter.js";
import {
  useDocumentFormParts,
  DocumentFileBlock,
} from "./documentFormParts.js";
import type { SpeelFormProps } from "./SpeelForm.js";

export interface SpeelDocumentFormProps<
  T extends SpeelDocument,
> extends SpeelFormProps<T> {
  /** Native accept filter for the file input, e.g. '.pdf,.docx'. */
  accept?: string;
}

/**
 * Document-library CRUD form. Create mode adds a REQUIRED file input and routes
 * the save through add(entity, { file }) — the file-upload pipeline — with an
 * upload progress bar. Edit/view show the stored file as a read-only link
 * (FileLeafRef → FileRef, auto-populated on SpeelDocument); replacing content
 * is deferred with the core replace-content phase.
 */
export function SpeelDocumentForm<T extends SpeelDocument>(
  props: SpeelDocumentFormProps<T>,
): JSX.Element {
  const [mode, setMode] = useState<FormMode>(props.mode ?? "edit");
  // Remount on mode change so useEntityForm's onSubmit closure never goes stale.
  return (
    <DocumentFormInner key={mode} {...props} mode={mode} setMode={setMode} />
  );
}

function DocumentFormInner<T extends SpeelDocument>(
  props: SpeelDocumentFormProps<T> & {
    mode: FormMode;
    setMode: (m: FormMode) => void;
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
    accept,
    onSaved,
    onCancel,
    onError,
    beforeSubmit,
    onSubmit,
  } = props;
  const parts = useDocumentFormParts(mode);

  const ef = useEntityForm(entity, mode, {
    onSaved: (e) => {
      parts.clearProgress();
      if (mode === "edit") setMode("view");
      onSaved?.(e as T);
    },
    onError: (err) => {
      parts.clearProgress();
      onError?.(err);
    },
    ...parts.formOptions,
    ...(beforeSubmit ? { beforeSubmit } : {}),
    ...(onSubmit
      ? { onSubmit: onSubmit as EntityFormOptions["onSubmit"] }
      : {}),
  });
  const isSubmitting = useStore(
    ef.form.store,
    (s) => s.isSubmitting as boolean,
  );
  const submit = parts.guardSubmit(ef);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <EntityFormBody
        ef={ef}
        {...(sections ? { sections } : {})}
        {...(fields ? { fields } : {})}
        {...(exclude ? { exclude } : {})}
      />
      <DocumentFileBlock
        mode={mode}
        entity={entity}
        parts={parts}
        {...(accept ? { accept } : {})}
        isSubmitting={isSubmitting}
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
