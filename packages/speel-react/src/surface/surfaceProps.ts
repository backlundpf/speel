import type { ReactNode } from "react";
import type { IEntity, FormMode } from "@speel/core";
import type { SpeelFormAction } from "../form/formFooter.js";
import type { FormSection } from "../form/EntityFormBody.js";
import type { EntityFormOptions } from "../form/useEntityForm.js";

/**
 * The one declaration of what a surface takes. `SpeelModal`, `SpeelPanel`,
 * `SurfaceForm` and `useSurfaces`' `FormRequest` all compose these rather than
 * restating them — four copies is how `defaultFullscreen` came to be accepted by
 * the modal and silently dropped on the way to its form.
 */

/** Chrome every surface shares: how it opens, what it is called, how big it is. */
export interface SurfaceChromeProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  blocking?: boolean;
  size?: "small" | "medium" | "large";
  /** User can resize the surface (the skin applies the default when undefined). */
  resizable?: boolean;
}

/** Chrome only a panel has. */
export interface PanelChromeProps extends SurfaceChromeProps {
  /** Which edge the drawer flies in from. Default 'end'. */
  position?: "start" | "end";
}

/** Chrome only a modal has. */
export interface ModalChromeProps extends SurfaceChromeProps {
  /** Drag by the title bar. */
  draggable?: boolean;
  /** Show a fullscreen toggle in the title bar. */
  fullscreenToggle?: boolean;
  /** Open maximized. Seeds the initial state — the toggle still works. */
  defaultFullscreen?: boolean;
}

/** The form variant: the surface hosts one entity form. */
export interface SurfaceFormVariantProps<T extends IEntity = IEntity> {
  entity: T;
  mode?: FormMode;
  fields?: string[];
  exclude?: string[];
  sections?: FormSection[];
  beforeSubmit?: () => void | Promise<void>;
  /** Caller-owned persistence — see EntityFormOptions.onSubmit. */
  onSubmit?: EntityFormOptions["onSubmit"];
  onSaved?: (entity: T) => void;
  onError?: (err: unknown) => void;
  closeOnSave?: boolean;
  /** 'document' renders the file block + required-file gate (showDocumentForm). */
  variant?: "entity" | "document";
  accept?: string;
}

/** The content variant: the surface hosts whatever you put in it. */
export interface SurfaceContentVariantProps {
  children: ReactNode;
  actions?: SpeelFormAction[];
}
