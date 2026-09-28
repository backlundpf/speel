import { authenticator } from "otplib";
import type { O365UserConfig } from "./env";

/** Generate the current 6-digit TOTP code from a base32 seed. Whitespace in the
 *  seed (common when copied from an authenticator setup screen) is stripped.
 *  Defaults match Microsoft Authenticator: SHA1, 6 digits, 30-second step. */
export function generateTotp(seed: string): string {
  return authenticator.generate(seed.replace(/\s+/g, ""));
}

/** Convenience: the current MFA code for a configured user. */
export function generateMfaCode(user: O365UserConfig): string {
  return generateTotp(user.totpSeed);
}
