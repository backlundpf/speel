# spfx-sample

## Summary

Short summary on functionality and used technologies.

[picture of the solution in action, if possible]

## Used SharePoint Framework Version

![version](https://img.shields.io/badge/version-1.22.2-green.svg)

## Applies to

- [SharePoint Framework](https://aka.ms/spfx)
- [Microsoft 365 tenant](https://docs.microsoft.com/sharepoint/dev/spfx/set-up-your-developer-tenant)

> Get your own free development tenant by subscribing to [Microsoft 365 developer program](http://aka.ms/o365devprogram)

## Prerequisites

> Any special pre-requisites?

## Solution

| Solution    | Author(s)                                               |
| ----------- | ------------------------------------------------------- |
| folder name | Author details (name, company, twitter alias with link) |

## Version history

| Version | Date             | Comments        |
| ------- | ---------------- | --------------- |
| 1.1     | March 10, 2021   | Update comment  |
| 1.0     | January 29, 2021 | Initial release |

## Disclaimer

**THIS CODE IS PROVIDED _AS IS_ WITHOUT WARRANTY OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING ANY IMPLIED WARRANTIES OF FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABILITY, OR NON-INFRINGEMENT.**

---

## Minimal Path to Awesome

- Clone this repository
- Ensure that you are at the solution folder
- in the command-line run:
  - `npm install -g @rushstack/heft`
  - `npm install`
  - `heft start`

> Include any additional steps as needed.

Other build commands can be listed using `heft --help`.

## Features

Description of the extension that expands upon high-level summary above.

This extension illustrates the following concepts:

- topic 1
- topic 2
- topic 3

> Notice that better pictures and documentation will increase the sample usage and the value you are providing for others. Thanks for your submissions advance.

> Share your web part with others through Microsoft 365 Patterns and Practices program to get visibility and exposure. More details on the community, open-source projects and other activities from http://aka.ms/m365pnp.

## Package documentation

Full documentation for each `@speel/*` package is available in the package READMEs:

- [`@speel/core`](../../packages/speel-core/README.md) — data layer, modeling, querying, saving, relationships
- [`@speel/pnpjs`](../../packages/speel-pnpjs/README.md) — SharePoint provider and schema provider backed by PnPjs
- [`@speel/migrations`](../../packages/speel-migrations/README.md) — EF-Core-style schema migrations for SharePoint
- [`@speel/migrations-cli`](../../packages/speel-migrations-cli/README.md) — design-time CLI for generating migrations
- [`@speel/react`](../../packages/speel-react/README.md) — Fluent v8 components: forms, tables, surfaces, feedback

## References

- [Getting started with SharePoint Framework](https://docs.microsoft.com/sharepoint/dev/spfx/set-up-your-developer-tenant)
- [Building for Microsoft teams](https://docs.microsoft.com/sharepoint/dev/spfx/build-for-teams-overview)
- [Use Microsoft Graph in your solution](https://docs.microsoft.com/sharepoint/dev/spfx/web-parts/get-started/using-microsoft-graph-apis)
- [Publish SharePoint Framework applications to the Marketplace](https://docs.microsoft.com/sharepoint/dev/spfx/publish-to-marketplace-overview)
- [Microsoft 365 Patterns and Practices](https://aka.ms/m365pnp) - Guidance, tooling, samples and open-source controls for your Microsoft 365 development
- [Heft Documentation](https://heft.rushstack.io/)

## speel-shadcn skin in SPFx

The **Speel shadcn Dashboard** web part in this sample proves the speel-shadcn skin
running inside SPFx 1.22.2 (React 17.0.1). The following recipe reproduces the setup
in any SPFx project.

### 1. Install runtime deps

```bash
npm install radix-ui react-day-picker lucide-react clsx tailwind-merge class-variance-authority tw-animate-css
npm install -D tailwindcss @tailwindcss/cli
```

No Fluent packages are required — the shadcn skin does not use Fluent primitives.

### 2. Install the skin via `shadcn add`

This sample consumes the skin the way any shadcn project does — `shadcn add` from the
speel-shadcn registry, no hand-copying. Add a `components.json` (standard layout: skin
and stock ui land under `src/components/`, `cn` under `src/lib/`):

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/speel-shadcn.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

Then install (public URL, or the local artifact if you have this monorepo checked out —
the local path avoids needing your registry change pushed first):

```bash
npx shadcn@latest add https://raw.githubusercontent.com/backlundpf/speel/main/registry/public/r/speel-shadcn.json --overwrite
# local: npx shadcn@latest add ../../registry/public/r/speel-shadcn.json --overwrite
```

This writes the 8 adapter files to `src/components/speel/` (incl. `compat.ts`), 16 stock
shadcn components to `src/components/ui/`, `cn` to `src/lib/utils.ts`, and injects the
speel theme tokens into `src/styles/speel-shadcn.css`. (`command` is excluded — cmdk needs
React 18; the multiselect uses a radix Popover + listbox instead.)

**React 17 patch-after-add.** Upstream shadcn ships React 19 components; three need the
React-17 adaptations kept in `registry/src/components/ui/`. Re-copy them after each `add`:

```bash
for f in badge button calendar; do cp ../../registry/src/components/ui/$f.tsx src/components/ui/$f.tsx; done
```

`button`/`badge`: shadcn v4's plain-function `Button` can't receive a `ref` from radix
`asChild` triggers on React 17, so popovers/tooltips render unanchored and invisible —
they're wrapped in `forwardRef`. `calendar`: pinned to this react-day-picker's `classNames` API.

### 3. Wire up TypeScript + webpack

```jsonc
// tsconfig.json — react-jsx matches the skin's automatic-runtime source (so shadcn add
// output needs no React-import patch); the react paths pins unify @types/react across the
// @speel/react file: symlink (else cross-package ReactElement types clash on React 17).
"compilerOptions": {
  "jsx": "react-jsx",
  "baseUrl": ".",
  "paths": {
    "@/*": ["src/*"],
    "react": ["node_modules/@types/react/index.d.ts"],
    "react/jsx-runtime": ["node_modules/@types/react/jsx-runtime.d.ts"],
    "react/jsx-dev-runtime": ["node_modules/@types/react/jsx-dev-runtime.d.ts"]
  }
}
```

tsconfig `paths` don't carry through heft's webpack stage, so alias `@` to the compiled
output in `config/spfx-customize-webpack.js`:

```js
config.resolve.alias["@"] = path.resolve(__dirname, "..", "lib");
config.module.rules.push({
  test: /\.mjs$/,
  resolve: { fullySpecified: false },
});
```

(The `.mjs` rule lets radix-ui's ESM import `react/jsx-runtime` without an extension.) If an
unanchored `lib`/`dist` `.gitignore` rule swallows `src/lib`/`src/components`, anchor those
ignores to the project root (`/lib`, `/dist`).

### 4. Tailwind sidecar CSS

The skin requires Tailwind-compiled CSS. SPFx shares a page with SharePoint, so the
sidecar's preflight is isolated behind cascade layers rather than shipped at full strength:

- Source entry: `src/styles/speel-shadcn.css` — declares the layer order
  `@layer preflight, theme, base, components, utilities` and imports
  `tailwindcss/preflight.css` into the lowest `preflight` layer, plus `theme.css`,
  `utilities.css`, and `tw-animate-css`. Because cascade layers always lose to unlayered
  rules and SharePoint's own CSS is unlayered, the global preflight is overridden across
  the SharePoint page — in practice it only takes effect on the skin's own elements. Tokens
  go on `:root`; the skin's base styling plus component-scoped resets live under
  `.speel-shadcn` in `@layer base`. Without the resets shadcn borders disappear and the box
  model inflates.
- Compile to `lib/styles/speel-shadcn.css` — a **build artifact** under the gitignored
  `lib/`, not a committed source file:

```bash
npm run tailwind:build   # calls: tailwindcss -i src/styles/speel-shadcn.css -o lib/styles/speel-shadcn.css --minify
```

The web part imports the **source** path `../../../styles/speel-shadcn.css`; since webpack
bundles from `lib/`, that resolves to the compiled `lib/styles/speel-shadcn.css`:

```tsx
import "../../../styles/speel-shadcn.css";
```

`npm run build` runs `tailwind:build` before `heft test` (and `heft test` drops `--clean`)
so the compiled artifact is present at bundle time. For **development**, run
`npm run tailwind:watch` in a **separate terminal** alongside `npm run start` — it keeps
`lib/styles/speel-shadcn.css` fresh as you edit. (Running both in one `concurrently` process
is unreliable: the watcher's automatic content detection trips over heft's `lib/` churn and
crashes with `inotify_add_watch … ENOENT`.)

### 5. Wrap the root element

The skin's CSS is scoped to `.speel-shadcn`. Every web part component root must carry
that class so the skin's base-layer rules (fonts, border colours, background) apply, and
so portaled surfaces (dialogs, popovers, sheets) self-tag correctly:

```tsx
<div className="speel-shadcn p-4">
  <SpeelProvider db={ctx} ui={shadcnAdapter}>
    {/* your content */}
  </SpeelProvider>
</div>
```

### 6. React 17 notes

Two changes distinguish the SPFx-safe skin from a plain shadcn setup:

- **`useStableId` shim** — `React.useId` is React 18+. The skin uses a
  `useStableId()` helper (`src/components/speel/compat.ts`) that falls back to a
  per-mount counter id on React 17.
- **No cmdk** — the Command palette component requires React 18 hooks. The multiselect
  Dropdown uses a radix `Popover` + native `listbox`/`option` roles instead. Arrow-key
  roving focus and toggle-by-click are implemented without cmdk.
- **`satisfies`-checked adapter cast** — the adapter object uses a compile-time
  `satisfies SpeelUIAdapter` check rather than an explicit type assertion; drop it if
  targeting strict React 17 typings that reject `satisfies`.
- **`forwardRef` on the stock ui `Button`** — shadcn's v4 `Button` is a plain function
  component (React 19 passes `ref` as a normal prop). On React 17, radix `asChild`
  triggers (`PopoverTrigger`, `TooltipTrigger`) can't pass their anchor ref to it, so
  the multiselect Dropdown, date picker, and tooltips render unanchored and zero-width —
  i.e. invisible. Wrap the vendored `Button` in `React.forwardRef`. Any other stock ui
  component you use as an `asChild` target needs the same.

### 7. Table scrolling in the SharePoint canvas

No action needed — handled in the skin, noted because the cause is non-obvious.
`ShadTable` wraps its table in `grid grid-cols-1` (= `minmax(0, 1fr)`). SharePoint
renders web parts inside a flex/grid section whose default `min-width: auto` would
otherwise let a wide table inflate its own container and defeat the table's
`overflow-x-auto`. The grid boundary caps the width so horizontal scrolling works.

## @speel/react field demo (manual verification)

This sample mounts the `@speel/react` field components (Fluent v8 skin) below the welcome block. Their behaviour is covered by the package unit tests; the following can only be verified on a **real SharePoint page** (the local workbench does not inject theme tokens):

1. `heft start` and add the web part to a **SharePoint page** (not the local workbench).
2. The "@speel/react field components" panel renders the `Project` fields with Fluent styling. Toggle **create / edit / view** — `view` shows read-only displays; `edit`/`create` show inputs.
3. **Validation:** clear `Title` and blur → "required"; a `Title` under 3 chars → length error; a negative `Budget` → "cannot be negative".
4. **Lookup (`Program`):** options load from the Programs list.
5. **People picker (`Owner`):** typing searches the directory via MS Graph — requires the `User.ReadBasic.All` permission in `config/package-solution.json` (`webApiPermissionRequests`) approved by a tenant admin. A picked user is ensured into the site (`ctx.siteUsers.ensureAsync`).
