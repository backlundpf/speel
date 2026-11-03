import { SpeelActionBar, type SpeelActions } from "../actions.js";

/** Footer for content-mode surfaces: the caller's actions (no form). */
export function ContentFooter({
  actions,
  idPrefix,
}: {
  actions?: SpeelActions;
  /** Ids the action buttons (see SpeelActionBar), so the surface can find one to focus. */
  idPrefix?: string;
}): JSX.Element | null {
  if (actions === undefined) return null;
  return (
    <SpeelActionBar
      actions={actions}
      {...(idPrefix !== undefined ? { idPrefix } : {})}
    />
  );
}
