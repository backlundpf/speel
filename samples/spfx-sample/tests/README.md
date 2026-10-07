# SPFx sample — Playwright tests

Three layers:

- **Unit** (`tests/helpers/*.spec.ts`) — pure logic (`env`, `totp`). No browser, no tenant.
  Run: `npm run test:unit`
- **Layout** (`tests/layout/*.spec.ts`) — the v8 table's real line boxes in Chromium, offline.
  No tenant, no serve. Run: `npm run test:layout` — see [Layout tests](#layout-tests).
- **E2E** (`tests/*.spec.ts`) — opens one of the two web part pages under `SP_BASE_URL`
  (`SitePages/AdminDashboard.aspx`, `ProjectDashboard.aspx`; the web parts are already
  deployed to them), scripts the Microsoft login (password + TOTP), and drives the web part
  against the live tenant. A spec picks its page with `dashboard.open("admin" | "project")`;
  the project dashboard renders in either skin, and `dashboard.open("project", { skin:
"shadcn" })` deep-links the shadcn one (`?skin=shadcn`). Only the **admin** page publishes
  `window.pd` (the live DbContext, actions and `pd.conformance`), so any spec that reaches for
  `pd` opens `admin`. Run: `npm run test:e2e` (headed: `npm run test:e2e:ui`).
  - `providerConformance.spec.ts` — the `@speel/core` provider conformance suite against the
    live provider: `PW_E2E=1 npx playwright test providerConformance --project e2e`.

## Layout tests

The `layout` Playwright project checks what jsdom can't: how the Fluent v8 table actually lays
out text. `tableLayout.spec.ts` bundles `layout/fixture.tsx` — `V8Table` scenarios rendered
from the sample's installed `@speel/react`, React 17 and Fluent 8 — with esbuild, loads it into
a blank page with the network blocked, and reads line boxes (`Range.getClientRects()`):
header words never split, an over-long word ends in "…", text never runs under the filter
button, a `wrap` column grows its row, a defaulted column is never narrower than its header
needs, and only a cut-off cell gets a hover title.

- **Run:** `npm run test:layout` here; it is also the last step of the root `npm run verify`.
  It reads `@speel/react` from its `dist/`, so rebuild the package after changing it.
- **Browser:** needs Playwright's Chromium once — `npx playwright install chromium`, or
  `npm run playwright:install` (adds `--with-deps`, needs sudo) on a CI-like machine.
- **Font:** the fixture pins Liberation Sans so canvas measurement and line breaking agree on
  every machine; Playwright's Linux dependencies install it.

## One-time machine setup

- `npx playwright install chromium` — downloads the browser binary.
- On Linux/WSL the browser also needs system libraries. If a run fails host validation
  (`libnspr4`, `libnss3`, `libasound2t64`, …): `sudo npx playwright install-deps`. The
  **unit** tests don't need any of this.

## Setup (e2e)

1. `cp .env.example .env` and fill `SP_TEST_PASSWORD` and `SP_TEST_TOTP_SEED` (the `primary`
   role's credentials), plus adjust `SP_TEST_USER` if needed.
2. Confirm `SP_LOCALHOST_MANIFEST`: start `npm run dev`, then
   `curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:4321/temp/build/manifests.js`
   — use whichever `/temp/...manifests.js` path returns `200`.
3. Keep `npm run dev` running (the config reuses it; otherwise it auto-launches one).
4. `npm run test:e2e`.

## Architecture

- **`tests/helpers/`** — `env.ts` (shared config via `loadEnv`, per-role credentials via
  `loadUser(role)`) and `totp.ts` (`generateTotp` / `generateMfaCode`). Both pure + unit-tested.
- **`tests/pages/`** — Page Objects. `o365Login.page.ts` drives the (messy, multi-screen)
  Microsoft sign-in. `projectDashboard.page.ts` loads the SPFx debug bundle, waits for
  `window.pd`, and reads live data.
- **`tests/fixtures/`** — `auth.fixtures.ts` is what e2e specs import (`import { test, expect }
from './fixtures/auth.fixtures'`). It provides `role → user → workerStorageState → authPage`:
  cached auth in `.auth/<browser>-<user>.json` is reused if still valid, otherwise the worker
  logs in once (under the `authLock.ts` file lock so parallel workers sharing a role don't all
  authenticate). Chromium uses the Desktop Chrome UA so headless presents as real Chrome.

### Adding a test

```ts
import { test, expect } from "./fixtures/auth.fixtures";
// `authPage` is an authenticated SharePoint page for the default `primary` role.
test("my dashboard test", async ({ authPage }) => {
  /* ... */
});
```

### Adding a role

Add a `ROLE_ENV` entry in `tests/helpers/env.ts` (and the union member), then set
`SP_<ROLE>_USER` / `SP_<ROLE>_PASSWORD` / `SP_<ROLE>_TOTP_SEED` in `.env`. Select it per
project/test with `test.use({ role: '<role>' })`.

## Troubleshooting

- **Login selectors drift:** run `test:e2e:ui` and update selectors in `pages/o365Login.page.ts`.
  Failure screenshots land in `test-results/` and `.auth/`.
- **`window.pd` never appears:** wrong manifest URL, serve not running, or the LNA flag isn't
  matching your Chromium — see `--disable-features` in `playwright.config.ts`.
- **Auth redirect loop:** delete the `.auth/*.json` for that browser/user and re-run to refresh.
