import type { ReactNode } from "react";
import type { SpeelUIAdapter } from "./adapter/SpeelUIAdapter.js";
import { UIAdapterContext } from "./context.js";

export interface SpeelUIProviderProps {
  /** The UI skin — the Fluent v8 skin via `@speel/react/fluent-v8`, or any `SpeelUIAdapter`. */
  ui: SpeelUIAdapter;
  children: ReactNode;
}

/**
 * The skin, and nothing else. `SpeelProvider` is the app-wide provider and needs a
 * `DbContext`; a surface that renders through the adapter but reads no data — the
 * migrations admin UI is the one in this package — has no context to give it. This
 * injects the adapter alone, so such a surface can match the site without the host
 * inventing a data context to satisfy it.
 *
 * Inside a `SpeelProvider` this is redundant: that provider already supplies the skin.
 */
export function SpeelUIProvider({
  ui,
  children,
}: SpeelUIProviderProps): JSX.Element {
  return (
    <UIAdapterContext.Provider value={ui}>{children}</UIAdapterContext.Provider>
  );
}
