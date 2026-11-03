import type { IEntity } from "@speel/core";
import { actionButtonId, autoFocusKey } from "../actions.js";
import { useStableId } from "../fluent-v8/useStableId.js";
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
  const footerId = useStableId();
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
    ariaLabel,
    blocking,
    size,
    resizable,
    draggable,
    fullscreenToggle,
    defaultFullscreen,
    returnFocus,
    style,
    ariaDescribedBy,
    children,
    actions,
  } = props;
  // An `autoFocus` action's button takes focus on open, found by the id the footer gives it.
  const focusKey = autoFocusKey(actions);
  return (
    <ui.Dialog
      open={open}
      onOpenChange={onOpenChange}
      {...(title !== undefined ? { title } : {})}
      {...(ariaLabel !== undefined ? { ariaLabel } : {})}
      {...(blocking !== undefined ? { blocking } : {})}
      {...(size !== undefined ? { size } : {})}
      {...(resizable !== undefined ? { resizable } : {})}
      {...(draggable !== undefined ? { draggable } : {})}
      {...(fullscreenToggle !== undefined ? { fullscreenToggle } : {})}
      {...(defaultFullscreen !== undefined ? { defaultFullscreen } : {})}
      {...(returnFocus !== undefined ? { returnFocus } : {})}
      {...(style !== undefined ? { style } : {})}
      {...(ariaDescribedBy !== undefined ? { ariaDescribedBy } : {})}
      {...(focusKey !== undefined
        ? {
            initialFocus: () =>
              document.getElementById(actionButtonId(footerId, focusKey)),
          }
        : {})}
      footer={
        <ContentFooter
          {...(actions ? { actions } : {})}
          {...(focusKey !== undefined ? { idPrefix: footerId } : {})}
        />
      }
    >
      {children}
    </ui.Dialog>
  );
}
