import { test, expect } from "@playwright/test";
import { authenticator } from "otplib";
import { generateTotp, generateMfaCode } from "./totp";

const SEED = "JBSWY3DPEHPK3PXP"; // RFC 4648 base32 example secret

test("generateTotp returns a 6-digit code", () => {
  expect(generateTotp(SEED)).toMatch(/^\d{6}$/);
});

test("generateMfaCode derives the code from the user seed", () => {
  const user = { username: "a@b.com", password: "pw", totpSeed: SEED };
  expect(generateMfaCode(user)).toBe(generateTotp(SEED));
});

test("the generated code validates against the same seed", () => {
  expect(authenticator.check(generateTotp(SEED), SEED)).toBe(true);
});

test("whitespace in the seed is tolerated", () => {
  expect(generateTotp("JBSW Y3DP EHPK 3PXP")).toBe(generateTotp(SEED));
});
