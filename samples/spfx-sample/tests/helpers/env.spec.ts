import { test, expect } from "@playwright/test";
import { loadEnv, loadUser } from "./env";

const SHARED = {
  SP_BASE_URL: "https://example.sharepoint.com/sites/x",
  SP_LOCALHOST_MANIFEST: "https://localhost:4321/temp/build/manifests.js",
} as NodeJS.ProcessEnv;

const USER = {
  SP_TEST_USER: "svc@contoso.com",
  SP_TEST_PASSWORD: "pw",
  SP_TEST_TOTP_SEED: "JBSWY3DPEHPK3PXP",
} as NodeJS.ProcessEnv;

test("loadEnv returns shared config when all vars are present", () => {
  const env = loadEnv(SHARED);
  expect(env.baseURL).toContain("sharepoint.com");
  expect(env.pages).toEqual({
    admin:
      "https://example.sharepoint.com/sites/x/SitePages/AdminDashboard.aspx",
    project:
      "https://example.sharepoint.com/sites/x/SitePages/ProjectDashboard.aspx",
  });
  expect(env.manifestUrl).toContain("localhost:4321");
});

test("loadEnv derives page URLs from a base URL with a trailing slash", () => {
  const env = loadEnv({
    ...SHARED,
    SP_BASE_URL: "https://example.sharepoint.com/sites/x/",
  } as NodeJS.ProcessEnv);
  expect(env.pages.admin).toBe(
    "https://example.sharepoint.com/sites/x/SitePages/AdminDashboard.aspx",
  );
});

test("loadEnv throws and names every missing shared var", () => {
  expect(() => loadEnv({} as NodeJS.ProcessEnv)).toThrow(
    /SP_BASE_URL[\s\S]*SP_LOCALHOST_MANIFEST/,
  );
});

test("loadUser(primary) reads the SP_TEST_* credentials", () => {
  const user = loadUser("primary", USER);
  expect(user.username).toBe("svc@contoso.com");
  expect(user.totpSeed).toBe("JBSWY3DPEHPK3PXP");
});

test("loadUser throws and names every missing credential var", () => {
  expect(() =>
    loadUser("primary", { SP_TEST_USER: "x" } as NodeJS.ProcessEnv),
  ).toThrow(/SP_TEST_PASSWORD[\s\S]*SP_TEST_TOTP_SEED/);
});
