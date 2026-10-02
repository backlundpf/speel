import { useState, type ComponentType } from "react";
import { useStore } from "@tanstack/react-form";
import type { IEntity, FormMode, SpeelDocument } from "@speel/core";
import type { DrawerProps } from "../adapter/SpeelUIAdapter.js";
import { useEntityForm } from "../form/useEntityForm.js";
import { EntityFormBody } from "../form/EntityFormBody.js";
import type {
  ModalChromeProps,
  PanelChromeProps,
  SurfaceFormVariantProps,
} from "./surfaceProps.js";
import { FormFooter } from "../form/formFooter.js";
import { resolveAllowEdit } from "../form/SpeelForm.js";
import {
  useDocumentFormParts,
  DocumentFileBlock,
} from "../form/documentFormParts.js";

export type SurfaceFormProps<T extends IEntity> = {
  /** The adapter surface chrome (Dialog or Drawer); Dialog ignores `position`. */
  Surface: ComponentType<DrawerProps>;
} & PanelChromeProps &
  ModalChromeProps &
  SurfaceFormVariantProps<T>;

/** A form hosted in a surface: one useEntityForm feeds the surface body + footer slots. */
export function SurfaceForm<T extends IEntity>(
  props: SurfaceFormProps<T>,
): JSX.Element {
  const [mode, setRawMode] = useState<FormMode>(props.mode ?? "edit");
  const canEdit = resolveAllowEdit(props.allowEdit, props.entity);
  const setMode = (m: FormMode): void => {
    if (m === "edit" && !canEdit) return;
    setRawMode(m);
  };
  // Fresh form per open AND per mode.
  return (
    <Inner
      key={`${props.open ? "o" : "c"}-${mode}`}
      {...props}
      mode={mode}
      setMode={setMode}
      canEdit={canEdit}
    />
  );
}

function Inner<T extends IEntity>(
  p: SurfaceFormProps<T> & {
    mode: FormMode;
    setMode: (m: FormMode) => void;
    canEdit: boolean;
  },
): JSX.Element {
  const {
    Surface,
    open,
    onOpenChange,
    title,
    blocking,
    size,
    position,
    entity,
    mode,
    setMode,
    fields,
    exclude,
    sections,
    onSaved,
    onError,
  } = p;
  const closeOnSave = p.closeOnSave ?? true;
  const isDocument = p.variant === "document";
  const parts = useDocumentFormParts(mode); // unconditional (hooks rule); inert for the entity variant
  const ef = useEntityForm(entity, mode, {
    onSaved: (e) => {
      parts.clearProgress();
      onSaved?.(e as T);
      if (closeOnSave) onOpenChange(false);
    },
    onError: (err) => {
      parts.clearProgress();
      onError?.(err);
    },
    ...(isDocument ? parts.formOptions : {}),
    ...(p.beforeSubmit ? { beforeSubmit: p.beforeSubmit } : {}),
    ...(p.onSubmit ? { onSubmit: p.onSubmit } : {}),
  });
  const isSubmitting = useStore(
    ef.form.store,
    (s) => s.isSubmitting as boolean,
  );
  const efForFooter = isDocument
    ? { ...ef, submit: parts.guardSubmit(ef) }
    : ef;
  return (
    <Surface
      open={open}
      onOpenChange={onOpenChange}
      {...(title !== undefined ? { title } : {})}
      {...(blocking !== undefined ? { blocking } : {})}
      {...(size !== undefined ? { size } : {})}
      {...(position !== undefined ? { position } : {})}
      {...(p.resizable !== undefined ? { resizable: p.resizable } : {})}
      {...(p.draggable !== undefined ? { draggable: p.draggable } : {})}
      {...(p.fullscreenToggle !== undefined
        ? { fullscreenToggle: p.fullscreenToggle }
        : {})}
      {...(p.defaultFullscreen !== undefined
        ? { defaultFullscreen: p.defaultFullscreen }
        : {})}
      footer={
        <FormFooter
          ef={efForFooter}
          mode={mode}
          setMode={setMode}
          canEdit={p.canEdit}
          onClose={() => onOpenChange(false)}
        />
      }
    >
      <EntityFormBody
        ef={ef}
        {...(sections ? { sections } : {})}
        {...(fields ? { fields } : {})}
        {...(exclude ? { exclude } : {})}
      />
      {isDocument ? (
        <DocumentFileBlock
          mode={mode}
          entity={entity as unknown as SpeelDocument}
          parts={parts}
          {...(p.accept ? { accept: p.accept } : {})}
          isSubmitting={isSubmitting}
        />
      ) : null}
    </Surface>
  );
}
