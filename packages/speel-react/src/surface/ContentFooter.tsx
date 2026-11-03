import type { RefObject } from "react";
import { SpeelActionBar, type SpeelActions } from "../actions.js";

/** Footer for content-mode surfaces: the caller's actions (no form). */
export function ContentFooter({
  actions,
  hostRef,
}: {
  actions?: SpeelActions;
  /** A layout-neutral (`display: contents`) wrapper, so the surface can find a button. */
  hostRef?: RefObject<HTMLSpanElement>;
}): JSX.Element | null {
  if (actions === undefined) return null;
  if (!hostRef) return <SpeelActionBar actions={actions} />;
  return (
    <span ref={hostRef} style={{ display: "contents" }}>
      <SpeelActionBar actions={actions} />
    </span>
  );
}
