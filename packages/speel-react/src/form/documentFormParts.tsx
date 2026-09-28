import { useCallback, useState } from "react";
import type { FormMode, SpeelDocument, IFileUploadProgress } from "@speel/core";
import { useSpeelUI } from "../context.js";
import type { EntityForm, EntityFormOptions } from "./useEntityForm.js";

/** Shared state/wiring for document forms (inline SpeelDocumentForm + document surfaces). */
export interface DocumentFormParts {
  /** Spread into useEntityForm options (create-mode getAddOptions + onAborted). */
  formOptions: Pick<EntityFormOptions, "getAddOptions" | "onAborted">;
  /** Compose into the host's onSaved/onError (progress reset). */
  clearProgress: () => void;
  /** Wrap ef.submit with the create-mode required-file gate. */
  guardSubmit: (ef: EntityForm) => () => Promise<void>;
  file: File | undefined;
  fileError: string | undefined;
  progress: number | undefined;
  onFileChange: (f: File | undefined) => void;
}

export function useDocumentFormParts(mode: FormMode): DocumentFormParts {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [progress, setProgress] = useState<number | undefined>(undefined);

  const clearProgress = useCallback(() => setProgress(undefined), []);
  const onFileChange = useCallback((f: File | undefined) => {
    setFile(f);
    if (f) setFileError(undefined);
  }, []);

  const formOptions: Pick<EntityFormOptions, "getAddOptions" | "onAborted"> = {
    onAborted: clearProgress,
    ...(mode === "create"
      ? {
          // No signal here: the staged file is reused across retries — the
          // save-level signal is forwarded to the upload by SaveExecutor.
          getAddOptions: () => ({
            file: {
              content: file!, // guarded by guardSubmit
              onProgress: (p: IFileUploadProgress) =>
                setProgress(
                  p.bytesTotal > 0 ? p.bytesUploaded / p.bytesTotal : undefined,
                ),
            },
          }),
        }
      : {}),
  };

  const guardSubmit = useCallback(
    (ef: EntityForm) => async (): Promise<void> => {
      if (mode === "create" && !file) {
        setFileError("A file is required.");
        // Save is clickable while invalid, so this click must also reveal the
        // field errors it is standing in front of — same as a blocked submit.
        ef.markAllTouched();
        return;
      }
      setFileError(undefined);
      await ef.submit();
    },
    [mode, file],
  );

  return {
    formOptions,
    clearProgress,
    guardSubmit,
    file,
    fileError,
    progress,
    onFileChange,
  };
}

/** The document file section: create → FileInput (+ progress); otherwise → read-only file link. */
export function DocumentFileBlock(props: {
  mode: FormMode;
  entity: SpeelDocument;
  parts: DocumentFormParts;
  accept?: string;
  isSubmitting: boolean;
}): JSX.Element {
  const ui = useSpeelUI();
  const { mode, entity, parts, accept, isSubmitting } = props;
  if (mode === "create") {
    return (
      <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <ui.FileInput
          label="File"
          required
          value={parts.file}
          disabled={isSubmitting}
          onChange={parts.onFileChange}
          {...(parts.fileError ? { error: parts.fileError } : {})}
          {...(accept ? { accept } : {})}
        />
        {parts.progress !== undefined ? (
          <ui.ProgressBar label="Uploading…" value={parts.progress} />
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <ui.FieldDisplay label="File">
        {entity.FileLeafRef && entity.FileRef ? (
          <a href={entity.FileRef}>{entity.FileLeafRef}</a>
        ) : (
          <span>—</span>
        )}
      </ui.FieldDisplay>
    </div>
  );
}
