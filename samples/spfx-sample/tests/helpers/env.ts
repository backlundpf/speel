/** One O365 account used to authenticate a test role. */
export interface O365UserConfig {
  username: string;
  password: string;
  totpSeed: string;
}

/** Test roles. Seeded with `primary`; add more as the dashboard build-out needs
 *  them (extend the union and add a ROLE_ENV entry below). */
export type Role = "primary";

/** Maps each role to the env vars holding its credentials. `primary` reuses the
 *  original SP_TEST_* names so existing .env files keep working; new roles follow
 *  the SP_<ROLE>_* convention. */
const ROLE_ENV: Record<
  Role,
  { username: string; password: string; totpSeed: string }
> = {
  primary: {
    username: "SP_TEST_USER",
    password: "SP_TEST_PASSWORD",
    totpSeed: "SP_TEST_TOTP_SEED",
  },
};

/**
 * The site pages, one per web part, each already hosting its web part. Only the
 * admin page publishes `window.pd` (the live DbContext, actions and conformance
 * suite), so a spec that reaches for `pd` opens `admin`.
 */
export type SitePage = "admin" | "project";

const SITE_PAGE_FILES: Record<SitePage, string> = {
  admin: "AdminDashboard.aspx",
  project: "ProjectDashboard.aspx",
};

/** Shared (non-credential) config common to every role/test. */
export interface TestEnv {
  /** Site URL — context baseURL + cached-auth verification target. */
  baseURL: string;
  /** Each web part's page: `SP_BASE_URL + /SitePages/<Name>.aspx`. */
  pages: Record<SitePage, string>;
  /** Local serve manifest URL for the debug query string. */
  manifestUrl: string;
}

const SHARED_KEYS = {
  baseURL: "SP_BASE_URL",
  manifestUrl: "SP_LOCALHOST_MANIFEST",
} as const;

/** Read every required key from `source`, collecting any that are missing/blank,
 *  then throw one actionable error naming all of them. */
function readAll(
  source: NodeJS.ProcessEnv,
  keys: Record<string, string>,
): Record<string, string> {
  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const [field, envName] of Object.entries(keys)) {
    const v = source[envName];
    if (v == null || v === "") {
      missing.push(envName);
      out[field] = "";
    } else {
      out[field] = v;
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required env var(s): ${missing.join(", ")}.\n` +
        `Copy samples/spfx-sample/.env.example to .env and fill them in.`,
    );
  }
  return out;
}

/** Shared config. Pure: pass an explicit source in tests. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): TestEnv {
  const v = readAll(source, SHARED_KEYS);
  const site = v.baseURL.replace(/\/+$/, "");
  const pages = Object.fromEntries(
    Object.entries(SITE_PAGE_FILES).map(([k, file]) => [
      k,
      `${site}/SitePages/${file}`,
    ]),
  ) as Record<SitePage, string>;
  return { baseURL: v.baseURL, pages, manifestUrl: v.manifestUrl };
}

/** Credentials for a role. Pure: pass an explicit source in tests. */
export function loadUser(
  role: Role,
  source: NodeJS.ProcessEnv = process.env,
): O365UserConfig {
  const keys = ROLE_ENV[role];
  if (!keys) {
    throw new Error(
      `Unknown test role "${role}". Known roles: ${Object.keys(ROLE_ENV).join(", ")}.`,
    );
  }
  const v = readAll(source, keys);
  return { username: v.username, password: v.password, totpSeed: v.totpSeed };
}
