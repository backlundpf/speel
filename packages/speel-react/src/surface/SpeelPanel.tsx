import type { IEntity } from "@speel/core";
import { useSpeelUI } from "../context.js";
import { SurfaceForm } from "./SurfaceForm.js";
import { ContentFooter } from "./ContentFooter.js";
import type {
  PanelChromeProps,
  SurfaceContentVariantProps,
  SurfaceFormVariantProps,
} from "./surfaceProps.js";

export type SpeelPanelProps<T extends IEntity = IEntity> = PanelChromeProps &
  (SurfaceFormVariantProps<T> | SurfaceContentVariantProps);

/** Side drawer hosting an entity form (`entity`/`mode`) or generic content (`children`/`actions`). */
export function SpeelPanel<T extends IEntity>(
  props: SpeelPanelProps<T>,
): JSX.Element {
  const ui = useSpeelUI();
  if (!ui.Drawer)
    throw new Error(
      "SpeelPanel requires a skin with a Drawer primitive (use @speel/react/fluent-v8).",
    );
  if ("entity" in props) {
    return <SurfaceForm Surface={ui.Drawer} {...props} />;
  }
  const {
    open,
    onOpenChange,
    title,
    blocking,
    size,
    position,
    resizable,
    children,
    actions,
  } = props;
  return (
    <ui.Drawer
      open={open}
      onOpenChange={onOpenChange}
      {...(title !== undefined ? { title } : {})}
      {...(blocking !== undefined ? { blocking } : {})}
      {...(size !== undefined ? { size } : {})}
      {...(position !== undefined ? { position } : {})}
      {...(resizable !== undefined ? { resizable } : {})}
      footer={<ContentFooter {...(actions ? { actions } : {})} />}
    >
      {children}
    </ui.Drawer>
  );
}
