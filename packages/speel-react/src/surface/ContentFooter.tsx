import { useSpeelUI } from "../context.js";
import type { SpeelFormAction } from "../form/formFooter.js";

/** Footer for content-mode surfaces: the custom action buttons (no form). */
export function ContentFooter({
  actions,
}: {
  actions?: SpeelFormAction[];
}): JSX.Element | null {
  const ui = useSpeelUI();
  if (!actions) return null;
  return (
    <>
      {actions.map((a) => (
        <ui.Button
          key={a.key}
          text={a.text}
          appearance={a.primary ? "primary" : "secondary"}
          type="button"
          disabled={a.disabled ?? false}
          {...(a.ariaLabel !== undefined ? { ariaLabel: a.ariaLabel } : {})}
          {...(a.onClick
            ? { onClick: () => a.onClick?.(undefined as never) }
            : {})}
        />
      ))}
    </>
  );
}
