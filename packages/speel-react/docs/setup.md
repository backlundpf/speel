# Setup

## What & when

`SpeelProvider` is the single wrapper that activates the entire `@speel/react` component
layer: it injects the data context, the UI skin, an optional people-search resolver, and
mounts the always-on overlay hosts (toasts, active tasks, imperative surfaces). Reach for
this page when you are wiring up the provider for the first time, choosing or customising
the Fluent v8 skin, or understanding how the layer stack fits together in an SPFx page.

## Canonical example

```tsx
import { SpeelProvider } from "@speel/react";
import { fluentV8Adapter } from "@speel/react/fluent-v8";
import { ProjectDashboardContext } from "./speel/ProjectDashboardContext";
import { initSpeelDbContext } from "@speel/core";

// In a WebPart's onInit():
const ctx = initSpeelDbContext(ProjectDashboardContext, (b) =>
  b.useSharePoint(this.context),
);

// Wrap your component tree once, at the root:
export function App({ ctx, peopleSearch }) {
  return (
    <SpeelProvider
      db={ctx}
      ui={fluentV8Adapter}
      peopleSearch={peopleSearch}
      config={{ fiscalYearStartMonth: 10, toast: { position: "top-right" } }}
    >
      <DashboardBody ctx={ctx} />
    </SpeelProvider>
  );
}
```

## Capabilities

### `SpeelProvider` props

`SpeelProvider` accepts five props plus `children`:

- **`db`** — the `DbContext` instance (from `initSpeelDbContext` in `@speel/core`). Every
  component and hook that reads or writes data reaches this context through the provider.
- **`ui`** — a `SpeelUIAdapter` implementation. In practice this is always
  `fluentV8Adapter` from `@speel/react/fluent-v8` in SPFx; custom adapters are
  possible but not the goal.
- **`identity`** — optional `SpeelIdentity` from `@speel/identity`. Carries the current user,
  authorization, and where per-user settings live, so `useCurrentUser`, `useAuthorized`,
  `usePermission`, and `useUserSetting` all work beneath it — and it is what lets the people
  picker list the site's groups and provision a person the site has never seen. Omitted,
  those hooks stay inert rather than throwing; the picker still renders and still searches.
- **`peopleSearch`** — optional `(query: string) => Promise<Principal[]>` resolver (the
  `PeopleSearch` type; `Principal` is `@speel/core`'s canonical shape). Defaults to
  `identity.users.search` when an identity is supplied, so the people picker gets suggestions
  without any wiring; pass your own to use Microsoft Graph instead, which wins. A hit needs
  only the columns a `Principal` declares (`Title`, `LoginName`, `Email`; an `Id` when known).
- **`config`** — optional `SpeelConfiguration` with static, app-wide scalars:
  - `fiscalYearStartMonth` (1–12, default 10) — drives the fiscal-year presets in date
    filters.
  - `fieldColumnMinWidth` (px, default 260) — governs when the responsive form-field
    grid opens a second column; tune this to match your web part's typical width.
  - `toast.position` and `toast.duration` — defaults for the always-on toast host
    mounted by the provider.

### Context hooks

All hooks below require `SpeelProvider` in the tree:

- **`useSpeelContext()`** — returns the `DbContext` read from the _React_ context injected
  by `SpeelProvider`. Use it for live context inside a component. (To _construct_ the
  `DbContext` in the first place, use `initSpeelDbContext` from `@speel/core` in `onInit` —
  a plain factory, not a React hook.)
- **`useSpeelUI()`** — returns the `SpeelUIAdapter` (the UI skin). Useful when
  rendering adapter primitives directly inside a custom component.
- **`useSpeelConfig()`** — returns the resolved `ResolvedSpeelConfig` (defaults
  applied). Use it when a component needs the fiscal-year month or the field-column
  width.
- **`usePeopleSearch()`** — returns the `PeopleSearch` resolver, or `undefined` when
  none was supplied. Used internally by the people picker.

### Layer stack (`layers.ts`)

`@speel/react` defines a fixed stacking order for its portaled overlays in `layers.ts`:

```
Z.blockingTasks  = 2_000_000
Z.runningTasks   = 3_000_000
Z.toasts         = 4_000_000
```

Fluent UI v8's own `Layer` portal sits at roughly 1 000 000. The layer ordering ensures
toasts appear above everything, blocking-task scrims appear above open modals and panels,
and running-task indicators float above the page. Consumers should not need to touch
these values, but if your SPFx page injects its own portals or sticky bars at custom
z-indexes, align against these constants.

### The Fluent v8 subpath

Import `fluentV8Adapter` from `@speel/react/fluent-v8`:

```ts
import { fluentV8Adapter } from "@speel/react/fluent-v8";
```

The subpath exports only `fluentV8Adapter`. The adapter's constituent primitives
(`V8TextInput`, `V8Dropdown`, etc.) are internal to the package and not part of
the public API. In virtually all cases only `fluentV8Adapter` is needed.

The adapter is **provider-free**: v8 controls render against the ambient Fabric theme
SharePoint already injects into the page, so no `ThemeProvider` wrapper is needed. Dark
mode follows SharePoint's theme automatically.

### The adapter seam

`SpeelUIAdapter` is the bounded interface that backs every rendered primitive in the
library — text inputs, dropdowns, date pickers, buttons, dialogs, drawers, tables, and
more. High-level components (`SpeelForm`, `SpeelEntityTable`, `SpeelModal`, …) never
import a concrete UI library; they call the adapter. `fluentV8Adapter` is the only
shipped skin, and it is the only intended skin for SPFx: SharePoint provides `@fluentui/react`
v8 as a shared singleton on the page, and loading a second UI framework version would
break that singleton. Custom adapter implementations are technically possible — the
interface is exported — but they are not a supported use-case and require implementing
every slot.

## Boundaries & gotchas

- **One `SpeelProvider` per page.** Nesting providers is not tested. In an SPFx page
  with multiple web parts backed by `@speel/react`, each web part mounts its own
  provider and its own `DbContext`; they are independent and share no state.

- **`MigrationsManager` does not require `SpeelProvider`.** It imports directly from
  `@speel/react/migrations` and is self-contained. All other components and hooks from
  the `.` export require the provider.

- **`useSpeelContext()` vs `initSpeelDbContext`.** `@speel/react` exports the
  `useSpeelContext()` hook, which reads the `DbContext` from the React context set by
  `SpeelProvider` (call it during render). `@speel/core` exports `initSpeelDbContext`, a
  plain factory — not a React hook — that constructs a `DbContext` from a builder; call it
  once in `onInit`. Import each from its own package.

- **`config` is not live-reactive.** The resolved configuration is memoised on the
  `fiscalYearStartMonth` and `fieldColumnMinWidth` values; changing the toast position
  after mount has no effect. Pass a stable config object or provide values up front.

- **Fluent v8 theme.** The adapter is provider-free by design — it assumes Fabric's
  `loadTheme` / `initializeIcons` have been called by the SPFx host before the web part
  renders. `@fluentui/react/lib/Icons` must be initialised for icon-button rendering.
  The `FluentWrapper` in the reference sample shows the idiomatic initialisation pattern.
