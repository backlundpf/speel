import { SpeelField, type SpeelFieldProps } from "./SpeelField.js";

// Thin, explicit aliases — the dispatcher still picks the primitive by config.kind,
// so these are for discoverability and call-site clarity.
export const SpeelTextField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelNumberField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelCurrencyField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelBooleanField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelDateTimeField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelChoiceField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelLookupField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
export const SpeelUserField = (p: SpeelFieldProps): JSX.Element | null => (
  <SpeelField {...p} />
);
