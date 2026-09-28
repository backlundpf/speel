import * as React from "react";
import { useState } from "react";

// React.useId exists on 18+; SPFx hosts run React 17. The availability check
// is module-constant, so calling the hook behind it is render-stable.
const useReactId: (() => string) | undefined = (
  React as { useId?: () => string }
).useId;

let counter = 0;

/** `React.useId` when available; stable per-mount counter id on React 17. */
export function useStableId(): string {
  if (useReactId) return useReactId();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- branch is module-constant
  const [id] = useState(() => `speel-${++counter}`);
  return id;
}
