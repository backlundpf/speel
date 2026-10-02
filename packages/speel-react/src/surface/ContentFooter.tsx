import { SpeelActionBar, type SpeelActions } from "../actions.js";

/** Footer for content-mode surfaces: the caller's actions (no form). */
export function ContentFooter({
  actions,
}: {
  actions?: SpeelActions;
}): JSX.Element | null {
  if (actions === undefined) return null;
  return <SpeelActionBar actions={actions} />;
}
