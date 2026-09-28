import { useMemo, type ReactNode } from "react";
import type { DbContext } from "@speel/core";
import type { SpeelUIAdapter } from "./adapter/SpeelUIAdapter.js";
import {
  DbContextReact,
  UIAdapterContext,
  PeopleSearchContext,
  SpeelConfigContext,
  DEFAULT_CONFIG,
  type PeopleSearch,
  type ResolvedSpeelConfig,
} from "./context.js";
import { ToastProvider, type ToastPosition } from "./toast/ToastProvider.js";
import { ActiveTasksProvider } from "./tasks/ActiveTasksProvider.js";
import { SurfaceManager } from "./surface/SurfaceManager.js";
import { UserSettingsProvider } from "./settings/useUserSetting.js";
import type { SpeelIdentity } from "@speel/identity";
import { IdentityContext } from "./context.js";

/**
 * Static, app-wide Speel settings — a single typed object so hosts see exactly what's
 * configurable (instead of a prop/context per value). Services (the data context, UI skin,
 * people search) stay as their own `SpeelProvider` props; this holds scalars only.
 */
export interface SpeelConfiguration {
  /** Fiscal-year start month (1–12) for date-filter presets. Default 10 (US federal FY). */
  fiscalYearStartMonth?: number;
  /** Min column width (px) for the responsive form-field grid — a new column appears past it. Default 260. */
  fieldColumnMinWidth?: number;
  /** Defaults for the always-mounted toast host. */
  toast?: { position?: ToastPosition; duration?: number };
}

export interface SpeelProviderProps {
  /** The EF-like data context (entities, model, save). */
  db: DbContext;
  /** The UI skin — the Fluent v8 skin via `@speel/react/fluent-v8`, or any `SpeelUIAdapter`. */
  ui: SpeelUIAdapter;
  /** Optional host-supplied directory search for the User field. */
  peopleSearch?: PeopleSearch;
  /** Static, app-wide configuration (fiscal year, field grid, toast defaults). */
  config?: SpeelConfiguration;
  /**
   * Who the user is, what they may do, and where their preferences live. Omitted, the identity
   * hooks stay inert rather than throwing and `useUserSetting` keeps values for the session
   * only — so a component need not know how the app is wired.
   */
  identity?: SpeelIdentity;
  children: ReactNode;
}

/**
 * Injects the DbContext, the UI adapter, an optional people-search resolver, and the resolved
 * configuration, and mounts the always-on overlay hosts (toasts, active tasks, imperative
 * surfaces) so useToast/useActiveTasks/useSurfaces/useOverlays work anywhere under the provider.
 * The Fluent v8 skin is provider-free — controls render against the host's ambient Fabric theme.
 */
export function SpeelProvider({
  db,
  ui,
  peopleSearch,
  config,
  identity,
  children,
}: SpeelProviderProps): JSX.Element {
  const resolved = useMemo<ResolvedSpeelConfig>(
    () => ({
      fiscalYearStartMonth:
        config?.fiscalYearStartMonth ?? DEFAULT_CONFIG.fiscalYearStartMonth,
      fieldColumnMinWidth:
        config?.fieldColumnMinWidth ?? DEFAULT_CONFIG.fieldColumnMinWidth,
    }),
    [config?.fiscalYearStartMonth, config?.fieldColumnMinWidth],
  );

  // The User field works as soon as identity is wired; an app wanting Graph still passes its
  // own resolver, and that wins.
  const resolvedPeopleSearch = useMemo<PeopleSearch | undefined>(
    () =>
      peopleSearch ??
      (identity ? (query) => identity.users.search(query) : undefined),
    [peopleSearch, identity],
  );

  const toast = config?.toast;
  return (
    <IdentityContext.Provider value={identity}>
      <DbContextReact.Provider value={db}>
        <UIAdapterContext.Provider value={ui}>
          <PeopleSearchContext.Provider value={resolvedPeopleSearch}>
            <SpeelConfigContext.Provider value={resolved}>
              <UserSettingsProvider store={identity?.settings}>
                <ToastProvider
                  {...(toast?.position ? { position: toast.position } : {})}
                  {...(toast?.duration !== undefined
                    ? { duration: toast.duration }
                    : {})}
                >
                  <ActiveTasksProvider>
                    <SurfaceManager>{children}</SurfaceManager>
                  </ActiveTasksProvider>
                </ToastProvider>
              </UserSettingsProvider>
            </SpeelConfigContext.Provider>
          </PeopleSearchContext.Provider>
        </UIAdapterContext.Provider>
      </DbContextReact.Provider>
    </IdentityContext.Provider>
  );
}
