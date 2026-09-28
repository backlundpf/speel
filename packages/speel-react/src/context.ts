import type { SpeelIdentity } from "@speel/identity";
import { createContext, useContext } from "react";
import type { DbContext, Principal } from "@speel/core";
import type { SpeelUIAdapter } from "./adapter/SpeelUIAdapter.js";

/** Host-supplied directory search for the User field (§6.5); the library ships no Graph client. */
export type PeopleSearch = (query: string) => Promise<Principal[]>;

export const DbContextReact = createContext<DbContext | null>(null);
export const UIAdapterContext = createContext<SpeelUIAdapter | null>(null);
export const PeopleSearchContext = createContext<PeopleSearch | undefined>(
  undefined,
);

/** The identity surface, when the host wired one. */
export const IdentityContext = createContext<SpeelIdentity | undefined>(
  undefined,
);

/**
 * Resolved Speel configuration (defaults applied), shared via one context instead of a
 * context per setting. The host passes a partial `SpeelConfiguration` to `<SpeelProvider>`;
 * this is what components read.
 */
export interface ResolvedSpeelConfig {
  /** Fiscal-year start month (1–12) for date-filter presets. */
  fiscalYearStartMonth: number;
  /** Min column width (px) for the responsive form-field grid. */
  fieldColumnMinWidth: number;
}

export const DEFAULT_CONFIG: ResolvedSpeelConfig = {
  fiscalYearStartMonth: 10,
  fieldColumnMinWidth: 260,
};

export const SpeelConfigContext =
  createContext<ResolvedSpeelConfig>(DEFAULT_CONFIG);

export function useSpeelContext(): DbContext {
  const db = useContext(DbContextReact);
  if (!db)
    throw new Error("useSpeelContext must be used within a <SpeelProvider>.");
  return db;
}

export function useSpeelUI(): SpeelUIAdapter {
  const ui = useContext(UIAdapterContext);
  if (!ui) throw new Error("useSpeelUI must be used within a <SpeelProvider>.");
  return ui;
}

export function usePeopleSearch(): PeopleSearch | undefined {
  return useContext(PeopleSearchContext);
}

/** The resolved Speel configuration (defaults applied). */
export function useSpeelConfig(): ResolvedSpeelConfig {
  return useContext(SpeelConfigContext);
}

/** App-wide fiscal-year start month (1–12); default 10 (US federal FY, Oct 1). */
export function useFiscalYearStart(): number {
  return useSpeelConfig().fiscalYearStartMonth;
}
