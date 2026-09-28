import type { IEntity } from "@speel/core";
import { useSpeelUI } from "../context.js";
import { SurfaceForm } from "./SurfaceForm.js";
import { ContentFooter } from "./ContentFooter.js";
import type {
  ModalChromeProps,
  SurfaceContentVariantProps,
  SurfaceFormVariantProps,
} from "./surfaceProps.js";

export type SpeelModalProps<T extends IEntity = IEntity> = ModalChromeProps &
  (SurfaceFormVariantProps<T> | SurfaceContentVariantProps);

/** Centered dialog hosting an entity form (`entity`/`mode`) or generic content (`children`/`actions`). */
export function SpeelModal<T extends IEntity>(
  props: SpeelModalProps<T>,
): JSX.Element {
  const ui = useSpeelUI();
  if (!ui.Dialog)
    throw new Error(
      "SpeelModal requires a skin with a Dialog primitive (use @speel/react/fluent-v8).",
    );
  if ("entity" in props) {
    return <SurfaceForm Surface={ui.Dialog} {...props} />;
  }
  const {
    open,
    onOpenChange,
    title,
    blocking,
    size,
    resizable,
    draggable,
    fullscreenToggle,
    defaultFullscreen,
    children,
    actions,
  } = props;
  return (
    <ui.Dialog
      open={open}
      onOpenChange={onOpenChange}
      {...(title !== undefined ? { title } : {})}
      {...(blocking !== undefined ? { blocking } : {})}
      {...(size !== undefined ? { size } : {})}
      {...(resizable !== undefined ? { resizable } : {})}
      {...(draggable !== undefined ? { draggable } : {})}
      {...(fullscreenToggle !== undefined ? { fullscreenToggle } : {})}
      {...(defaultFullscreen !== undefined ? { defaultFullscreen } : {})}
      footer={<ContentFooter {...(actions ? { actions } : {})} />}
    >
      {children}
    </ui.Dialog>
  );
}
