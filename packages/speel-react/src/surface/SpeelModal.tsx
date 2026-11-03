import { useRef } from "react";
import type { IEntity } from "@speel/core";
import { autoFocusIndex } from "../actions.js";
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
  const footerRef = useRef<HTMLSpanElement>(null);
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
  // An `autoFocus` action's button takes focus on open (found in the footer: each action
  // renders one skin button, in SpeelActionBar's order).
  const focusAt = autoFocusIndex(actions);
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
      {...(focusAt >= 0
        ? {
            initialFocus: () =>
              footerRef.current?.querySelectorAll<HTMLElement>("button")[
                focusAt
              ],
          }
        : {})}
      footer={
        <ContentFooter
          {...(actions ? { actions } : {})}
          {...(focusAt >= 0 ? { hostRef: footerRef } : {})}
        />
      }
    >
      {children}
    </ui.Dialog>
  );
}
